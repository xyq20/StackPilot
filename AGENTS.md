# GitHub 访问

- 本项目所有 GitHub 网络操作都经当前开发电脑的本机代理，包括 Git 克隆、拉取、推送，`gh`、GitHub API、网页、Raw 文件和 Release 附件下载。重定向后的下载请求也沿用代理。
- 每次换电脑先从系统网络设置或本机代理客户端确认协议、地址和端口。macOS 可用 `scutil --proxy` 查看，Windows 可查看「设置 → 网络和 Internet → 代理」或代理客户端的监听端口。
- Git 使用 HTTPS 远端。将实际代理 URL 赋给 `proxy` 后，命令行可用 `git -c http.proxy="$proxy" fetch origin`。首次克隆也用同一方式。需要让当前仓库记住地址时，运行 `git config --local 'http.https://github.com/.proxy' "$proxy"`。
- `gh` 和 API 客户端要显式使用该代理。例如在 macOS 或 Linux 上使用 `HTTPS_PROXY="$proxy" HTTP_PROXY="$proxy" gh api user`。用 curl 时可用 `curl --proxy "$proxy" --noproxy '' -IL URL` 检查下载与重定向。检查 `NO_PROXY` 与 `no_proxy` 的排除项，确保 GitHub 相关域名经过代理；本地工作台仍通过回环地址访问。
- 自动化或连接器访问 GitHub 时，也须能确认其流量经过本机代理；否则使用本机可指定代理的客户端。连接失败时先排查代理，恢复后重试。
