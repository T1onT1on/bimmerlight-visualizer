# FLM Probe（只读）

读取左右两只前大灯模块 FLM2（左 `0x43`、右 `0x44`）的信息并显示在车机上。**只读**：所有请求都经过 `kit/runtime/readonly-diag.js`，它只放行 UDS `0x22` 读取，其余服务（例程 `31`、写入 `2E`、I/O 控制 `2F`、会话、复位等）在发出前就会被拒绝。这个 App 不会点亮任何灯，也不会改动模块。

## 读取内容

| DID | 内容 | 页面 |
| --- | --- | --- |
| `F150` | SGBD 索引：确认是 `FLM02_L/R`，还是 `FLM2_1`、`FLM02X` 等变体 | Modules |
| `F186` | 当前诊断会话 | Modules |
| `D9BC` | 模块输入电压 | Modules |
| `DA71` | 大灯变体：车型、是否 LCI、左/右舵、厂商、SA（5AZ）、ECE/US | Modules |
| `D9FC` | 每颗灯源接在哪个物理 LED 输出上（近光 1–4、DRL 1–4、激光、激光装饰 1–2 等） | LED map |
| `D6DB` | 通道 1–15 读取那一刻的 PWM %、电流 mA、电压 V | Channels |
| `D7A7` | 模块当前看到的各灯光功能状态字节 | Functions |
| `3009` / `300A` | 迎宾灯 Staging1 / Staging2 数据（模块可能拒绝） | Welcome data |

解码布局来自 `FLM02_L/R`（REVISION 2.200），来源是 [EdiabasX SGBD Reference](https://emdzej.github.io/ediabasx-docs-sgbd/)。如果 SGBD 不是 `FLM02`，Modules 页会提示，此时以保存文件里的原始字节为准。

## 使用

1. 点火开（不必启动发动机），打开 App，按 **Read**。左右两侧共发 18 条读取请求。
2. 每次读取都会保存到 App 数据目录：`flm_probe_latest.json`，外加一份带时间戳的副本。文件里包含每条请求的状态（ok / refused + NRC / timeout）和原始十六进制字节。
3. 把 JSON 拷回电脑，用来核对通道映射，以及迎宾数据与 FLM Light Studio 是否一致（两边的 SHA-256 算法相同）。

## 录制（Record）

按 **Record** 后，App 会在设定时长内（设置里的 Recording length，默认 60 秒）不停地交替读取左右两侧的 `D6DB`，每读 10 轮再读一次 `D7A7`（其中的 WELL 字节表示模块是否看到迎宾灯）。读取仍然只用 UDS `22`。Record 页会实时画出每个通道的 PWM 曲线，再按一次（按钮此时显示 Stop）可以提前结束。

结果保存为 `flm_record_latest.json`，外加一份带时间戳的副本。每个样本记录请求发出和收到回复的时间（从开始算起的毫秒数）以及 15 个通道的 PWM。

用法：坐在车里、车机开着时按 Record，然后用钥匙锁车、再解锁，让迎宾灯在录制期间播放一次。

没有诊断链路时（PC 预览、模拟器），设置里的 Demo data 为 Auto 会改用 `demo.js` 的假数据，界面上会显示 DEMO。

## 开发

```sh
node kit/tools/test_flm_probe.js                       # 解码、迎宾数据解析、只发 22 的检查
python kit/tools/build.py --preview-only flm_probe     # 无 SDK 的 PC 预览构建
node kit/tools/preview.js dist/flm_probe out wait=1 BTN_SCAN wait=3 render BTN_PAGE render --set renderer=software
```

装车需要从自己车机提取的 `oap-sdk` 和车机 root 权限，步骤见仓库根目录 README 第 3 节。
