# Particle Page Effect

一个用 Canvas 实现的书页粒子散开原型。

## 功能

- 上传任意书页或图片
- 黑白像素化采样
- 控制散开进度、像素块大小、散开强度、旋转量、波浪延迟和粒子密度
- 支持反相、文字边缘强化、随机漂移
- 保存当前画面为 PNG

## 本地运行

直接打开 `index.html`，或者启动一个静态服务器：

```powershell
python -m http.server 4177 --bind 127.0.0.1
```

然后访问：

```text
http://127.0.0.1:4177
```
