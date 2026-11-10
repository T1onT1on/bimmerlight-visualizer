# 车机 App：FLM Probe 与 FLM Lab

两个运行在 BMW iDrive 7（MGU）车机上的 App，基于 [idrive7-apps](https://github.com/cauliflowermossgrape/idrive7-apps) 的开发套件。机制和实测结论见仓库根目录的 [`机制.md`](../机制.md)。

| App | 版本 | 作用 |
| --- | --- | --- |
| [`apps/flm_probe`](apps/flm_probe/README.md) | 0.2.0 | **只读**。读取左右大灯模块（FLM2）的变体、LED 通道映射、通道 PWM、功能状态、迎宾 Staging 数据；录制迎宾灯播放过程中各通道 PWM |
| [`apps/flm_lab`](apps/flm_lab/README.md) | 0.1.1 | **实验性，会控制灯光**。发送灯光功能和单通道命令，运行预设灯光秀；车速超过 3 km/h 时不发送 |

这两个文件夹不能单独构建，必须放进 idrive7-apps 仓库里，使用它的 `kit/`。

## 放进 idrive7-apps

```sh
git clone https://github.com/cauliflowermossgrape/idrive7-apps.git
cp -r head-unit-apps/apps/flm_probe head-unit-apps/apps/flm_lab idrive7-apps/apps/
cp head-unit-apps/tests/test_flm_probe.js head-unit-apps/tests/test_flm_lab.js idrive7-apps/kit/tools/
cd idrive7-apps
node kit/tools/test_flm_probe.js
node kit/tools/test_flm_lab.js
python kit/tools/build.py --preview-only flm_probe flm_lab
```

`--preview-only` 只生成电脑预览，不需要 BMW 的 SDK，也不能装车。

## 装车（已在车上验证的方式：mgu-store 的 U 盘源码仓库）

车上需要已经装好 [mgu-store](https://github.com/robertnisipeanu/mgu-store)。车机会用车上原厂 App 里的 SDK 自己构建，电脑上不需要 SDK。

1. 准备一个只含这两个 App 的 idrive7-apps 副本，文件夹名就是 U 盘上源的名字（例如 `flm-probe`）：
   - 复制 idrive7-apps 中 git 跟踪的全部文件，`apps/` 里只放 `flm_probe` 和 `flm_lab`；
   - 编辑副本的 `mgu-repo.json`：删除 `tools` 段和 `apps.requires`，把 `apps.build.network` 设为 `[]`，避免 U 盘重复提供渲染器工具。
2. 写入 U 盘（FAT32 / exFAT）：

   ```sh
   node mgu-store/deploy/mgu-install.js usb-repo <U盘根目录> <副本文件夹>
   ```

   注意：输入如果是 git 仓库，`usb-repo` 只复制 **git 跟踪的文件**，未提交的 App 会被漏掉，所以要用上面准备的普通文件夹。

   在 Mac 上也可以直接把打好的 `mgu-repo/<名字>/` 解压到 U 盘，之后一定要运行 `dot_clean -m <U盘>`，清掉 macOS 生成的 `._*` 文件。
3. U 盘插车上 → Store → **USB** 页 → 安装或更新。

## 取回数据

App 的数据目录在车机的 `/var/opt/public/oap/oap_<uid>/data/`：

| 文件 | 来源 |
| --- | --- |
| `flm_probe_latest.json` | FLM Probe 的 Read |
| `flm_record_latest.json` | FLM Probe 的 Record |
| `flm_lab_log.jsonl` | FLM Lab 发出的每条命令和回复 |

用车机 root SSH 拷回，例如 `scp root@<车机地址>:/var/opt/public/oap/*/data/flm_probe_latest.json .`。经 ENET 连接时，Mac 上可能需要加 `-o BindAddress=<ENET 网卡地址>`，否则链路本地地址会走错网卡。
