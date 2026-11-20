#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""StackPilot 会话关联助手。运行 python3 StackPilot-Chat-Link.py 后在本机浏览器选择会话。"""
import argparse
import base64
import json
import os
import re
import secrets
import socket
import sqlite3
import threading
import webbrowser
from contextlib import closing
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

PROJECTS_B64 = "__STACKPILOT_PROJECTS_B64__"
UUID = re.compile(r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}", re.I)


def fit_text(value, length):
    # Match the UTF-16 length limits of the JavaScript import endpoint.
    return value.encode("utf-16-le", errors="replace")[:length * 2].decode("utf-16-le", errors="ignore")


def metadata(thread_id, title, cwd):
    if not isinstance(thread_id, str) or not UUID.fullmatch(thread_id):
        return None
    title = title if isinstance(title, str) else ""
    cwd = cwd if isinstance(cwd, str) else ""
    name = next((line.strip() for line in title.splitlines() if line.strip()), "未命名对话")
    return {"threadId": thread_id.lower(), "title": fit_text(name, 160), "cwd": fit_text(cwd, 2048)}


def read_sqlite(filename):
    # mode=ro also sees committed rows from the WAL of an open Codex desktop app.
    uri = filename.resolve().as_uri() + "?mode=ro"
    with closing(sqlite3.connect(uri, uri=True, timeout=1.5)) as db:
        db.execute("PRAGMA query_only=ON")
        columns = {row[1] for row in db.execute("PRAGMA table_info(threads)")}
        if "id" not in columns or not columns.intersection({"name", "title"}):
            raise ValueError("不兼容的会话索引")
        titles = ["nullif(trim(" + name + "),'')" for name in ("name", "title") if name in columns]
        title = "coalesce(" + ",".join(titles + ["''"]) + ")"
        cwd = "substr(cwd,1,2048)" if "cwd" in columns else "''"
        predicates = []
        if "source" in columns:
            predicates.extend(["lower(coalesce(source,'')) NOT LIKE '%subagent%'", "lower(coalesce(source,'')) NOT LIKE '%sub_agent%'"])
        optional = {
            "agent_path": "coalesce(agent_path,'') IN ('','/root')",
            "agent_role": "coalesce(agent_role,'')=''",
            "attached_thread_parent_id": "attached_thread_parent_id IS NULL",
            "archived": "coalesce(archived,0)=0",
        }
        predicates.extend(predicate for key, predicate in optional.items() if key in columns)
        ordering = [key + " DESC" for key in ("updated_at_ms", "updated_at", "created_at") if key in columns]
        query = "SELECT id,substr(" + title + ",1,160)," + cwd + " FROM threads"
        if predicates:
            query += " WHERE " + " AND ".join(predicates)
        query += " ORDER BY " + ", ".join(ordering + ["id DESC"])
        result = []
        for thread_id, name, folder in db.execute(query):
            row = metadata(thread_id, name, folder)
            if row:
                result.append(row)
        return result


def read_jsonl(filename):
    found = {}
    with filename.open(encoding="utf-8-sig") as index:
        for line in index:
            try:
                item = json.loads(line)
            except (ValueError, RecursionError):
                continue
            if not isinstance(item, dict) or item.get("archived") or item.get("agent_role"):
                continue
            if item.get("attached_thread_parent_id") or item.get("agent_path") not in (None, "", "/root"):
                continue
            if "subagent" in str(item.get("source", "")).lower().replace("_", ""):
                continue
            row = metadata(item.get("id"), item.get("thread_name") or item.get("title") or item.get("name"), item.get("cwd"))
            if row:
                # A rename can append another row for the same thread.
                found.pop(row["threadId"], None)
                found[row["threadId"]] = row
    return list(reversed(list(found.values())))


def discover():
    home = Path(os.environ.get("CODEX_HOME") or Path.home() / ".codex").expanduser()
    try:
        names = [(int(p.stem[6:]), p) for p in home.glob("state_*.sqlite") if re.fullmatch(r"state_\d+", p.stem)]
        for _, filename in sorted(names, reverse=True):
            try:
                return read_sqlite(filename), filename.name
            except (ValueError, sqlite3.Error, OSError):
                continue
        if (home / "session_index.jsonl").is_file():
            return read_jsonl(home / "session_index.jsonl"), "session_index.jsonl"
    except (OSError, UnicodeError):
        pass
    return [], ""


PAGE = """<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>会话关联助手 · StackPilot</title>
    <style>
      * {
        box-sizing: border-box;
      }
      body {
        margin: 0;
        background: #f6f6fb;
        color: #272334;
        font:
          15px/1.5 -apple-system,
          BlinkMacSystemFont,
          'Segoe UI',
          'PingFang SC',
          'Microsoft YaHei',
          sans-serif;
      }
      main {
        max-width: 960px;
        margin: auto;
        padding: 36px 20px;
      }
      header,
      .row,
      .pager,
      .footer {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
      }
      h1 {
        font-size: 27px;
        margin: 0;
      }
      h2 {
        font-size: 17px;
        margin: 0;
      }
      p,
      .muted {
        color: #666174;
      }
      .panel {
        background: white;
        border: 1px solid #e2dfeb;
        border-radius: 14px;
        padding: 20px;
        margin-top: 14px;
      }
      .inputs {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 14px;
      }
      label {
        font-weight: 600;
      }
      input:not([type='checkbox']),
      select {
        display: block;
        width: 100%;
        font: inherit;
        padding: 9px 11px;
        border: 1px solid #d4d0df;
        border-radius: 7px;
        margin-top: 5px;
        background: white;
        color: inherit;
      }
      .search {
        margin: 14px 0;
      }
      .session {
        display: flex;
        gap: 12px;
        padding: 11px 0;
        border-bottom: 1px solid #eeeaf5;
        cursor: pointer;
        align-items: flex-start;
        font-weight: 500;
      }
      .session input {
        margin-top: 5px;
        accent-color: #6553c8;
      }
      .session a {
        color: #6151ab;
        font-size: 13px;
        white-space: nowrap;
        margin-left: auto;
        text-decoration: none;
      }
      .session a:hover {
        text-decoration: underline;
      }
      .session label {
        display: flex;
        gap: 12px;
        min-width: 0;
        align-items: flex-start;
        cursor: pointer;
      }
      .session small {
        display: block;
        color: #726d80;
        font-weight: 400;
        overflow-wrap: anywhere;
      }
      .session span {
        min-width: 0;
        overflow-wrap: anywhere;
      }
      button {
        font: inherit;
        cursor: pointer;
        border: 1px solid #dbd7e4;
        border-radius: 8px;
        background: white;
        color: inherit;
        padding: 7px 13px;
      }
      button.primary {
        background: #6553c8;
        color: white;
        border-color: #6553c8;
      }
      button:disabled {
        opacity: 0.45;
        cursor: default;
      }
      .pager,
      .footer {
        margin-top: 12px;
      }
      .pager span {
        font-size: 13px;
        color: #696477;
      }
      .picked {
        display: flex;
        gap: 8px;
        align-items: center;
        justify-content: space-between;
        padding: 6px 0;
      }
      .picked span {
        overflow-wrap: anywhere;
      }
      .picked button {
        font-size: 12px;
        padding: 3px 8px;
      }
      #status {
        color: #5645aa;
      }
      #status:empty {
        display: none;
      }
      :focus-visible {
        outline: 3px solid #998bd3;
        outline-offset: 2px;
      }
      @media (max-width: 600px) {
        main {
          padding: 20px 12px;
        }
        .inputs {
          grid-template-columns: 1fr;
        }
        .footer,
        .row {
          flex-wrap: wrap;
        }
        .panel {
          padding: 14px;
        }
      }
    </style>
  </head>
  <body>
    <main>
      <header>
        <h1>会话关联助手</h1>
        <button id="quit">结束助手</button>
      </header>
      <p>
        选择项目和这台电脑上的 Codex 会话，把导出的关联清单带回 StackPilot。
      </p>
      <div class="panel inputs">
        <label
          >来源电脑<input
            id="machine"
            maxlength="120"
            placeholder="如：开发 Mac" /></label
        ><label>所属项目<select id="project"></select></label>
      </div>
      <section class="panel">
        <div class="row">
          <h2>选择会话</h2>
          <span id="source" class="muted"></span>
        </div>
        <label class="search"
          ><input
            type="search"
            id="search"
            aria-label="搜索会话"
            placeholder="搜索标题、项目目录或会话 ID"
        /></label>
        <div id="sessions"></div>
        <div class="pager">
          <button id="prev">上一页</button><span id="count"></span
          ><button id="next">下一页</button>
        </div>
      </section>
      <section class="panel">
        <h2 id="summary">已选关联</h2>
        <div id="chosen"></div>
        <div class="footer">
          <span class="muted">导出字段包含项目编号、会话编号、标题和目录。</span
          ><button class="primary" id="export" disabled>下载关联清单</button>
        </div>
      </section>
      <p id="status" role="status"></p>
    </main>
    <script>
      const el = (id) => document.getElementById(id)
      const selected = new Map(),
        perPage = 16
      let projects = [],
        sessions = [],
        source = '',
        page = 0
      function status(text) {
        el('status').textContent = text
      }
      function cleanup(node) {
        node.replaceChildren()
      }
      function render() {
        const search = el('search').value.trim().toLowerCase(),
          appId = el('project').value
        const list = sessions.filter((s) =>
          [s.title, s.cwd, s.threadId].some((v) =>
            v.toLowerCase().includes(search),
          ),
        )
        const pages = Math.max(1, Math.ceil(list.length / perPage))
        page = Math.min(page, pages - 1)
        const box = el('sessions')
        cleanup(box)
        if (!list.length)
          box.textContent = source
            ? '没有符合条件的会话。'
            : '未找到可读取的会话索引。请确认使用运行 Codex 的用户账号，或设置 CODEX_HOME 后重启助手。'
        for (const s of list.slice(page * perPage, (page + 1) * perPage)) {
          const row = document.createElement('div'),
            label = document.createElement('label'),
            check = document.createElement('input'),
            text = document.createElement('span'),
            detail = document.createElement('small')
          const key = appId + '|' + s.threadId
          row.className = 'session'
          check.type = 'checkbox'
          check.disabled = !appId
          check.checked = selected.has(key)
          check.onchange = () => {
            if (check.checked) {
              selected.set(key, { appId, threadId: s.threadId })
            } else {
              selected.delete(key)
            }
            render()
          }
          text.textContent = s.title
          detail.textContent = [s.cwd, s.threadId].filter(Boolean).join(' · ')
          text.append(detail)
          label.append(check, text)
          const open = document.createElement('a')
          open.href = 'codex://threads/' + s.threadId
          open.textContent = '打开会话'
          open.setAttribute('aria-label', '打开会话：' + s.title)
          row.append(label, open)
          box.append(row)
        }
        el('count').textContent =
          list.length + ' 个匹配 · ' + (page + 1) + ' / ' + pages
        el('prev').disabled = page === 0
        el('next').disabled = page >= pages - 1
        el('summary').textContent = '已选关联 · ' + selected.size
        const chosen = el('chosen')
        cleanup(chosen)
        for (const [key, link] of selected) {
          const row = document.createElement('div'),
            text = document.createElement('span'),
            remove = document.createElement('button')
          row.className = 'picked'
          text.textContent =
            projects.find((p) => p.id === link.appId).name +
            ' / ' +
            sessions.find((s) => s.threadId === link.threadId).title
          remove.textContent = '移除'
          remove.onclick = () => {
            selected.delete(key)
            render()
          }
          row.append(text, remove)
          chosen.append(row)
        }
        el('export').disabled = !selected.size || !el('machine').value.trim()
      }
      el('prev').onclick = () => {
        page--
        render()
      }
      el('next').onclick = () => {
        page++
        render()
      }
      el('search').oninput = () => {
        page = 0
        render()
      }
      el('project').onchange = () => {
        page = 0
        render()
      }
      el('machine').oninput = render
      el('export').onclick = async () => {
        try {
          const r = await fetch('export', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              machine: el('machine').value.trim(),
              links: [...selected.values()],
            }),
          })
          if (!r.ok) throw Error((await r.json()).error)
          const url = URL.createObjectURL(await r.blob()),
            a = document.createElement('a')
          a.href = url
          a.download = 'StackPilot-Chat-Links.json'
          a.click()
          setTimeout(() => URL.revokeObjectURL(url), 1000)
          status(
            '已导出 ' +
              selected.size +
              ' 条关联。请把 JSON 文件带回工作台导入。',
          )
        } catch (e) {
          status(e.message)
        }
      }
      el('quit').onclick = async () => {
        try {
          await fetch('quit', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: '{}',
          })
          document.querySelector('main').textContent = '助手已关闭。'
        } catch {
          status('可在终端按 Ctrl+C 结束助手。')
        }
      }
      fetch('data')
        .then((r) => r.json())
        .then((d) => {
          projects = d.projects
          sessions = d.sessions
          source = d.source
          el('machine').value = d.machine
          for (const p of projects) el('project').add(new Option(p.name, p.id))
          el('source').textContent = source
            ? '本机索引 · ' + source
            : '未检测到索引'
          if (!projects.length) status('请先在工作台登记项目，再重新下载助手。')
          render()
        })
        .catch(() => status('助手连接失败，请重新运行脚本。'))
    </script>
  </body>
</html>
"""


def run(open_browser=True):
    projects = json.loads(base64.b64decode(PROJECTS_B64).decode("utf-8"))
    valid_projects = {project["id"] for project in projects}
    sessions, source = discover()
    by_id = {row["threadId"]: row for row in sessions}
    prefix = "/" + secrets.token_urlsafe(24) + "/"
    home_data = {"projects": projects, "sessions": sessions, "source": source, "machine": socket.gethostname()[:120]}

    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *args):
            pass

        def reply(self, status, data, content_type="application/json; charset=utf-8"):
            if not isinstance(data, bytes):
                data = json.dumps(data, ensure_ascii=False).encode("utf-8")
            self.send_response(status)
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(len(data)))
            self.send_header("Cache-Control", "no-store")
            self.send_header("Referrer-Policy", "no-referrer")
            self.send_header("X-Content-Type-Options", "nosniff")
            self.send_header("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'")
            self.end_headers()
            self.wfile.write(data)

        def local(self):
            return self.headers.get("Host") == host and self.headers.get("Origin", origin) == origin

        def do_GET(self):
            if not self.local():
                return self.reply(403, {"error":"仅供本机使用"})
            if self.path == prefix:
                return self.reply(200, PAGE.encode("utf-8"), "text/html; charset=utf-8")
            if self.path == prefix + "data":
                return self.reply(200, home_data)
            self.reply(404, {"error":"页面不存在"})

        def do_POST(self):
            if not self.local() or self.path not in (prefix+"export", prefix+"quit"):
                return self.reply(403, {"error":"请求无效"})
            if self.headers.get_content_type() != "application/json":
                return self.reply(415, {"error":"需要 JSON 请求"})
            try:
                size = int(self.headers.get("Content-Length", "0"))
                if not 0 < size <= 128000:
                    raise ValueError()
                data = json.loads(self.rfile.read(size))
                if not isinstance(data, dict):
                    raise ValueError()
            except (ValueError, RecursionError):
                return self.reply(400, {"error":"请求格式有误"})
            if self.path.endswith("/quit"):
                self.reply(200, {"ok":True})
                threading.Thread(target=self.server.shutdown, daemon=True).start()
                return
            machine = data.get("machine")
            if not isinstance(machine,str) or not machine.strip() or fit_text(machine.strip(), 120) != machine.strip():
                return self.reply(400, {"error":"请输入不超过 120 个字符的电脑名称"})
            selected = data.get("links")
            if not isinstance(selected,list) or not 1 <= len(selected) <= 200:
                return self.reply(400, {"error":"每份清单可包含 1 至 200 条关联"})
            links, seen = [], set()
            for item in selected:
                if not isinstance(item, dict):
                    return self.reply(400, {"error":"关联格式有误"})
                app_id, thread_id = item.get("appId"), item.get("threadId")
                if not isinstance(app_id,str) or not isinstance(thread_id,str) or app_id not in valid_projects or thread_id not in by_id:
                    return self.reply(400, {"error":"请选择清单中存在的项目和会话"})
                if (app_id,thread_id) not in seen:
                    seen.add((app_id,thread_id))
                    links.append({"appId":app_id, **by_id[thread_id]})
            self.reply(200, {"format":"stackpilot-chat-links", "version":1, "machine":machine.strip(), "links":links})

    with ThreadingHTTPServer(("127.0.0.1", 0), Handler) as server:
        host = "127.0.0.1:" + str(server.server_port)
        origin = "http://" + host
        url = origin + prefix
        print("StackPilot: " + url, flush=True)
        if open_browser:
            threading.Timer(0.2, lambda: webbrowser.open(url)).start()
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass


if __name__ == "__main__":
    arguments = argparse.ArgumentParser(description="StackPilot 离线会话关联助手")
    arguments.add_argument("--no-browser", action="store_true", help="显示本机链接，由你自行打开浏览器")
    run(not arguments.parse_args().no_browser)
