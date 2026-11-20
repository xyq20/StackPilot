export type OfficeLook = { id: string; label: string; gender: 'male' | 'female' }

export const looks: OfficeLook[] = [
  { id: 'm01', label: '蓝帽黄卫衣', gender: 'male' },
  { id: 'm02', label: '圆镜绿背心', gender: 'male' },
  { id: 'm03', label: '蓝白棒球衫', gender: 'male' },
  { id: 'm04', label: '橙帽青夹克', gender: 'male' },
  { id: 'm05', label: '中分紫开衫', gender: 'male' },
  { id: 'm06', label: '卷发珊瑚衫', gender: 'male' },
  { id: 'm07', label: '银发圆镜', gender: 'male' },
  { id: 'm08', label: '蓝帽条纹衫', gender: 'male' },
  { id: 'm09', label: '发髻绿工装', gender: 'male' },
  { id: 'm10', label: '耳机红格衫', gender: 'male' },
  { id: 'f01', label: '红贝雷海魂衫', gender: 'female' },
  { id: 'f02', label: '高马尾黄卫衣', gender: 'female' },
  { id: 'f03', label: '绿镜紫背带', gender: 'female' },
  { id: 'f04', label: '双髻青开衫', gender: 'female' },
  { id: 'f05', label: '白镜牛仔衣', gender: 'female' },
  { id: 'f06', label: '编发砖红裙', gender: 'female' },
  { id: 'f07', label: '发箍天蓝衫', gender: 'female' },
  { id: 'f08', label: '银紫短发', gender: 'female' },
  { id: 'f09', label: '丸子头背带裤', gender: 'female' },
  { id: 'f10', label: '黄帽绿外套', gender: 'female' },
]

export function lookSrc(id: string, view: 'front' | 'back'): string {
  const look = looks.find((item) => item.id === id)
  return '/office/people/' + (look?.id ?? looks[0].id) + '-' + view + '.png'
}
