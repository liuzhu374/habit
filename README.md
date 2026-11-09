<p align="center">
  <img src="build/icon-1024.png" width="112" alt="Habit 图标">
</p>

<h1 align="center">Habit · 每日一记</h1>

<p align="center">
  学习之前，先花一分钟回忆一个公式、一段证明或一个知识点。<br>
  Habit 会按照<b>记忆曲线</b>，挑出这一次最该复习的那一条。
</p>

<p align="center">
  <img src="docs/front.png" width="49%" alt="翻开之前：先回想">
  <img src="docs/review.png" width="49%" alt="翻开之后：对照答案打分">
</p>

## 特点

- **每次只给你一条**：打开就能看到这次要复习什么，不会被一长串列表吓到
- **先回想，再翻开**：标题和提示在前，答案在后，用主动回忆加深记忆
- **按记忆曲线安排**：使用 [FSRS](https://github.com/open-spaced-repetition/fsrs4anki) 算法（Anki 现在用的开源调度算法），记得越牢，间隔越长
- **数学友好**：标题、提示和内容都可以写 LaTeX 公式，内容还支持 Markdown，编辑时实时预览
- **标题也能放图片**：看图回忆（“这是哪个函数的图像？”），截图直接粘贴进标题框
- **资料随便放**：可以写文字，也可以粘贴截图、插入 PDF，或者批量导入 `.md` 文件
- **完全本地**：数据只保存在你自己的电脑上，不需要注册，也不联网
- **轻松但简洁**：浅色 / 深色模式自动切换
- **Mac、Windows、安卓都能用**

## 安装

### Windows

1. 到 [Releases](https://github.com/liuzhu374/habit/releases/latest) 下载 `Habit-windows-x64.zip`（Windows 10 / 11，64 位）
2. 解压到任意位置（比如 `D:\Habit`），双击里面的 **Habit.exe** 就能用，不需要安装。可以右键 Habit.exe →「发送到 → 桌面快捷方式」
3. 第一次打开时，如果出现蓝色的「Windows 已保护你的电脑」，这是因为 App 没有购买代码签名证书。点「更多信息」→「仍要运行」即可
4. 以后更新：用新版本的文件夹替换旧的，数据不受影响

### 安卓

1. 到 [Releases](https://github.com/liuzhu374/habit/releases/latest) 下载 `Habit-android.apk`（支持 Android 7.0 及以上）
2. 在手机上打开下载好的文件。第一次安装时，系统会提示“禁止安装未知来源的应用”，按提示允许浏览器（或文件管理器）安装应用即可
3. 以后更新时，直接安装新版本的 APK 就会覆盖旧版本，数据会保留

### macOS：直接下载（推荐）

1. 到 [Releases](https://github.com/liuzhu374/habit/releases/latest) 下载 `Habit-mac-arm64.zip`（适用于 M1 及之后的 Apple 芯片 Mac）
2. 解压后，把 **Habit.app** 拖进「应用程序」文件夹
3. 第一次打开时，macOS 可能会提示“无法验证开发者”，这是因为 App 没有经过苹果公证。可以用下面任意一种方法解决：
   - 打开「系统设置 → 隐私与安全性」，在页面下方点「仍要打开」
   - 或者在终端里运行：
     ```bash
     xattr -dr com.apple.quarantine /Applications/Habit.app
     ```

Intel 芯片的 Mac 请从源码构建。

### macOS：从源码构建

需要先安装 [Node.js](https://nodejs.org/) 20 或以上版本。

```bash
git clone https://github.com/liuzhu374/habit.git
cd habit
npm install
npm run install-app     # 打包并安装到 /Applications/Habit.app
```

构建会自动匹配你电脑的芯片类型（Apple 芯片或 Intel）。

## 怎么用

### 每次学习前

1. 打开 Habit，看到这次要复习的**标题**，以及可选的提示（比如“写出期望和方差”）
2. 先在脑子里或草稿纸上**完整回想一遍**
3. 点「翻开看看」，对照答案给自己打分：

| 按钮 | 意思 | 下次出现 |
|---|---|---|
| 😵‍💫 忘了 | 没想起来 | 10 分钟后 |
| 🤔 模糊 | 想起了一部分 | 间隔较短 |
| 😎 记得 | 完整想起来了 | 间隔变长：大约 3 天 → 11 天 → 39 天 → 4 个月… |

每个按钮下方会直接显示“几天后再见”。打完分以后，可以「再来一个」，也可以「去学习吧」。

**快捷键**（电脑）：`空格` 翻开 · `1` `2` `3` 打分 · `N` 再来一个 · 编辑时 `⌘S` / `Ctrl+S` 保存

### 它怎么决定复习哪一条

每条内容都会记录“稳定性”和“难度”，Habit 据此估算你**此刻还记得它的概率**，然后：

1. **有到期的**：选其中最快要忘的那条
2. **没有到期的**：引入一条新内容（每天最多 3 条，可以在设置里修改）
3. **都没有**：选记得最不牢的那条，提前巩固

「换一个」只会在这次跳过它，不影响记忆进度。

<p align="center">
  <img src="docs/library.png" width="49%" alt="资料库">
  <img src="docs/review-dark.png" width="49%" alt="深色模式">
</p>

### 添加资料

在「资料库」里点 **＋ 新建**，填写：

- **标题**：复习时最先看到的问题，比如“正态分布的概率密度函数”，也可以写公式：`高斯积分 $\int_{-\infty}^{\infty} e^{-x^2}\,dx$`，或者放图片：点标题下方的「🖼 给标题加图片」，也可以直接把截图粘贴或拖进标题框。图片在标题里显示为 `![](/uploads/…)`，可以和文字、公式混排
- **科目**：用来分类，比如“概率论”
- **回想提示**（可选）：翻开前显示，比如“写出密度函数、期望和方差”，同样可以写公式
- **内容**：答案，支持 Markdown 和 LaTeX

公式写法：行内公式 `$x^2$`，独立公式 `$$\int_0^1 f(x)\,dx$$`，也支持 `\( \)` 和 `\[ \]`。标题和提示里的公式都按行内排版。
另外预置了几个快捷命令：`\R` `\N` `\Z` `\Q` `\C`（黑板粗体），`\E` `\P`（期望、概率），`\Var` `\Cov`。

### 可以导入的文件

在资料库点「导入文件」，或者直接把文件拖进窗口：

| 文件 | 导入后 |
|---|---|
| `.md` `.markdown` `.txt` | 每个一级标题 `# 标题` 变成一条；没有一级标题的话，整个文件算一条，标题用文件名 |
| 图片 `.png` `.jpg` `.jpeg` `.gif` `.webp` | 每张图片一条，标题用文件名 |
| `.pdf` | 每个文件一条，翻开后直接在卡片里阅读 |
| `.json` | 恢复 Habit 导出的备份 |

编辑内容时，也可以直接**粘贴截图**，或者把图片和 PDF 拖进编辑框。单个文件最大 50 MB。

在安卓上，导入和插入图片都会打开系统的文件选择器；点开图片会全屏显示，按返回键关闭。

## 数据与备份

所有数据都保存在本机。Mac 上在 `~/Library/Application Support/Habit/data/`，Windows 上在 `%APPDATA%\Habit\data\`：

```
data/
├── library.json   # 所有内容和复习记录
├── uploads/       # 图片和 PDF
└── backups/       # 每天自动备份一份，保留 14 天
```

在「资料库 → 设置与备份」里可以导出备份、从备份恢复，或者直接打开这个文件夹。换电脑时，导出备份再在新电脑上恢复就可以了。如果有图片或 PDF，记得把 `uploads/` 文件夹一起复制过去。

安卓版的数据存在 App 自己的私有目录里，结构和 Mac 版一样，同样每天自动备份。点「导出」会打开系统分享面板，可以把备份存到云盘、发给自己，或者传到另一台设备上恢复。目前备份文件里只有文字内容和复习记录，**不包含图片和 PDF**，所以在 Mac 和安卓之间迁移时，带图片的卡片需要重新插入图片。


### 构建 Windows 版

在 Mac 上也能打 Windows 包，不需要 Windows 电脑：

```bash
npm install
npm run zip-win        # 生成 dist/Habit-windows-x64.zip
```

### 构建安卓版

需要 JDK 21 和 Android SDK（platform 36、build-tools）。在 macOS 上可以这样准备：

```bash
brew install openjdk@21 && brew install --cask android-commandlinetools
export JAVA_HOME=$(brew --prefix openjdk@21)/libexec/openjdk.jdk/Contents/Home
export ANDROID_HOME=~/Library/Android/sdk
sdkmanager --sdk_root=$ANDROID_HOME "platform-tools" "platforms;android-36" "build-tools;36.0.0"
```

然后：

```bash
npm install
npm run android        # 生成 dist/Habit-android.apk
```

签名密钥不放在仓库里。在 `~/.gradle/gradle.properties` 中配置 `HABIT_STORE_FILE`、`HABIT_STORE_PASSWORD`、`HABIT_KEY_ALIAS`、`HABIT_KEY_PASSWORD` 后，生成的 APK 会自动签名；没有配置的话，生成的是未签名的 APK，手机上装不了。

项目结构：

```
electron/main.js   电脑版（Mac / Windows）外壳：启动内置服务，打开窗口
server.js          电脑版内置本地服务（只监听 127.0.0.1 的随机端口）
lib/api.js         API 逻辑（电脑版和安卓共用）
lib/srs.js         FSRS 调度、选卡逻辑、统计
lib/store.js       电脑版数据读写：原子写入 + 每日备份
public/            界面（原生 JavaScript，不需要构建）
public/native.js   安卓版的本地后端：数据存储、图片、PDF（pdf.js）、返回键
android/           安卓工程（Capacitor）
scripts/           把界面整理到 www/，供安卓打包
build/             App 图标
test/              测试
```
## 许可

[MIT](LICENSE)
