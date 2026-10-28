// 首次打开时可一键放入的示例内容
export const SAMPLES = [
  {
    title: '正态分布的概率密度函数',
    subject: '概率论',
    prompt: '写出 X ~ N(μ, σ²) 的密度函数，以及期望和方差',
    content: String.raw`$$f(x)=\frac{1}{\sqrt{2\pi}\,\sigma}\exp\left(-\frac{(x-\mu)^2}{2\sigma^2}\right),\quad x\in\R$$

- 期望 $\E[X]=\mu$，方差 $\Var(X)=\sigma^2$
- 标准化：$Z=\dfrac{X-\mu}{\sigma}\sim N(0,1)$
- 记忆点：归一化常数来自 $\int_{-\infty}^{\infty} e^{-x^2/2}\,dx=\sqrt{2\pi}$`,
  },
  {
    title: '指数分布与无记忆性',
    subject: '概率论',
    prompt: '写出 Exp(λ) 的密度，并证明无记忆性',
    content: String.raw`**密度**：$f(x)=\lambda e^{-\lambda x}$，$x\ge 0$；生存函数 $P(X>x)=e^{-\lambda x}$

**无记忆性**：对任意 $s,t\ge 0$，
$$P(X>s+t\mid X>s)=\frac{P(X>s+t)}{P(X>s)}=\frac{e^{-\lambda(s+t)}}{e^{-\lambda s}}=e^{-\lambda t}=P(X>t).$$`,
  },
  {
    title: '柯西–施瓦茨不等式',
    subject: '线性代数',
    prompt: '叙述并用判别式法证明',
    content: String.raw`**命题**：内积空间中 $|\langle u,v\rangle|\le\|u\|\,\|v\|$。

**证明**（实内积空间）：$v=0$ 时显然。否则对任意 $t\in\R$，
$$0\le\|u-tv\|^2=\|u\|^2-2t\langle u,v\rangle+t^2\|v\|^2.$$
右边是关于 $t$ 的非负二次函数，所以判别式 $\le 0$：
$$4\langle u,v\rangle^2-4\|u\|^2\|v\|^2\le 0.$$
整理即得。等号成立当且仅当 $u,v$ 线性相关。$\blacksquare$`,
  },
  {
    title: '√2 是无理数',
    subject: '数学证明',
    prompt: '用反证法证明',
    content: String.raw`假设 $\sqrt2=\dfrac pq$，其中 $p,q$ 为互素的正整数。

1. 两边平方：$p^2=2q^2$，所以 $p^2$ 是偶数，从而 $p$ 是偶数，记 $p=2k$。
2. 代入得 $4k^2=2q^2$，即 $q^2=2k^2$，所以 $q$ 也是偶数。
3. $p,q$ 都是偶数，与互素矛盾。

所以 $\sqrt2$ 是无理数。$\blacksquare$`,
  },
];
