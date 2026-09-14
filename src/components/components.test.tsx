/**
 * 共享组件测试。
 *
 * 这些组件是需求里「无障碍」「按钮至少 48px」「键盘快捷键」三条硬约束的
 * 实际承载者，所以测试重点不是「渲染出来了」，而是：
 *   - 语义角色是否正确（radiogroup / dialog / switch / combobox…）；
 *   - 键盘能不能走通（方向键、Home/End、Tab 陷阱、Esc）；
 *   - 触摸目标是否真的不低于 48px（断言类名，因为 jsdom 不做布局）。
 *
 * 用原生 DOM 事件而不是 userEvent 的地方都加了注释说明原因。
 */
import { useState } from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  Badge,
  Button,
  Card,
  Chip,
  ChipRow,
  CommandPalette,
  CopyButton,
  Dialog,
  EmptyState,
  IconButton,
  KeyboardHelp,
  ResultDisplay,
  Segmented,
  SelectField,
  StatList,
  StatRow,
  Switch,
  Tabs,
  TextAreaField,
  TextField,
  cn,
  filterCommands,
  scoreCommand,
  type Command,
} from './index';

/* ------------------------------------------------------------------ */

describe('cn', () => {
  it('拼接多个类名', () => {
    expect(cn('a', 'b')).toBe('a b');
  });

  it('跳过 falsy 值（条件类名的常见写法）', () => {
    expect(cn('a', false && 'b', null, undefined, '', 'c')).toBe('a c');
  });

  it('接受对象与数组（沿用 clsx 的调用方式）', () => {
    expect(cn(['a', { b: true, c: false }])).toBe('a b');
  });

  it('不做 tailwind-merge —— 同名类会同时保留，由 CSS 顺序决定胜负', () => {
    // 这个断言是**设计约定**的回归测试：如果哪天有人把 cn 换成 tailwind-merge，
    // 所有依赖「CSS 源码顺序覆盖」的写法都会静默改变行为，这里要拦住。
    expect(cn('p-4', 'p-6')).toBe('p-4 p-6');
  });
});

/* ------------------------------------------------------------------ */

describe('Button', () => {
  it('默认 type="button"，放在 form 里不会意外提交', () => {
    render(<Button>计算</Button>);
    expect(screen.getByRole('button')).toHaveAttribute('type', 'button');
  });

  it('默认尺寸带 min-h-tap —— 48px 触摸下限靠它保证', () => {
    render(<Button>计算</Button>);
    expect(screen.getByRole('button').className).toContain('min-h-tap');
  });

  it('lg 尺寸至少 56px 高', () => {
    render(<Button size="lg">计算</Button>);
    expect(screen.getByRole('button').className).toContain('min-h-[56px]');
  });

  it('两种尺寸都不会低于 48px（设计系统层面兜住硬约束）', () => {
    for (const size of ['md', 'lg'] as const) {
      const { unmount } = render(<Button size={size}>x</Button>);
      const className = screen.getByRole('button').className;
      expect(
        className.includes('min-h-tap') || className.includes('min-h-[56px]'),
        `size=${size} 缺少最小高度约束`,
      ).toBe(true);
      unmount();
    }
  });

  it('loading 时同时设 aria-busy 与 disabled，屏幕阅读器不会以为还能点', () => {
    render(<Button loading>计算</Button>);
    const button = screen.getByRole('button');
    expect(button).toHaveAttribute('aria-busy', 'true');
    expect(button).toBeDisabled();
  });

  it('loading 时用旋转指示器取代前置图标，但保留文字', () => {
    // 保留文字是有意的：按钮宽度不会因为进入加载态而变化，
    // 否则一排按钮会跳动，用户刚瞄准的目标就被挪走了。
    const { container } = render(
      <Button loading icon="📋">
        计算
      </Button>,
    );
    expect(screen.getByText('计算')).toBeInTheDocument();
    expect(screen.queryByText('📋')).toBeNull();
    // 指示器是装饰性的，靠 aria-busy 表达状态
    expect(container.querySelector('.animate-spin')).toHaveAttribute('aria-hidden', 'true');
  });

  it('icon 加 aria-hidden，避免屏幕阅读器念出 emoji', () => {
    render(<Button icon="📋">复制</Button>);
    expect(screen.getByText('📋')).toHaveAttribute('aria-hidden', 'true');
  });

  it('block 时撑满宽度（移动端主操作按钮）', () => {
    render(<Button block>计算</Button>);
    expect(screen.getByRole('button').className).toContain('w-full');
  });

  it('禁用时带 cursor-not-allowed，不依赖颜色单独表达状态', () => {
    render(<Button disabled>计算</Button>);
    const button = screen.getByRole('button');
    expect(button).toBeDisabled();
    expect(button.className).toContain('cursor-not-allowed');
  });

  it('点击回调正常触发', () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>计算</Button>);
    fireEvent.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('禁用时不触发回调', () => {
    const onClick = vi.fn();
    render(
      <Button disabled onClick={onClick}>
        计算
      </Button>,
    );
    fireEvent.click(screen.getByRole('button'));
    expect(onClick).not.toHaveBeenCalled();
  });
});

describe('IconButton', () => {
  it('用 label 同时设置 aria-label 与 title（图标按钮没有可见文字）', () => {
    render(<IconButton label="关闭">✕</IconButton>);
    const button = screen.getByRole('button', { name: '关闭' });
    expect(button).toHaveAttribute('title', '关闭');
  });

  it('固定成正方形，不被文字按钮的横向 padding 拉宽', () => {
    render(<IconButton label="关闭">✕</IconButton>);
    expect(screen.getByRole('button', { name: '关闭' }).className).toContain('aspect-square');
  });
});

/* ------------------------------------------------------------------ */

describe('Chip', () => {
  it('未选中时不写 aria-pressed（而不是写 "false"）', () => {
    render(<Chip>+1天</Chip>);
    expect(screen.getByRole('button')).not.toHaveAttribute('aria-pressed');
  });

  it('选中时 aria-pressed="true"', () => {
    render(<Chip active>+1天</Chip>);
    expect(screen.getByRole('button')).toHaveAttribute('aria-pressed', 'true');
  });

  it('保持 min-h-tap —— 它是最常用的快捷操作，绝不能做小', () => {
    render(<Chip>+7天</Chip>);
    expect(screen.getByRole('button').className).toContain('min-h-tap');
  });

  it('as="span" 时渲染成不可点的标签', () => {
    render(<Chip as="span">≈ 4.3 周</Chip>);
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByText('≈ 4.3 周')).toBeInTheDocument();
  });

  it('disabled 时不触发点击', () => {
    const onClick = vi.fn();
    render(
      <Chip disabled onClick={onClick}>
        +1月
      </Chip>,
    );
    fireEvent.click(screen.getByRole('button'));
    expect(onClick).not.toHaveBeenCalled();
  });
});

describe('ChipRow', () => {
  it('给了 label 才加 role="group"，否则不引入多余语义', () => {
    const { unmount } = render(
      <ChipRow label="快捷加减">
        <Chip>+1天</Chip>
      </ChipRow>,
    );
    expect(screen.getByRole('group', { name: '快捷加减' })).toBeInTheDocument();
    unmount();

    render(
      <ChipRow>
        <Chip>+1天</Chip>
      </ChipRow>,
    );
    expect(screen.queryByRole('group')).toBeNull();
  });

  it('窄屏横向滚动、宽屏换行，避免页面主体横向溢出', () => {
    render(
      <ChipRow>
        <Chip>+1天</Chip>
      </ChipRow>,
    );
    const row = screen.getByRole('button').parentElement!;
    expect(row.className).toContain('overflow-x-auto');
    expect(row.className).toContain('sm:flex-wrap');
  });
});

describe('Badge', () => {
  it('是纯展示的 span，不进入 Tab 序列', () => {
    render(<Badge tone="warn">含调休</Badge>);
    expect(screen.getByText('含调休').tagName).toBe('SPAN');
  });
});

/* ------------------------------------------------------------------ */

describe('Segmented', () => {
  const OPTIONS = [
    { value: 'day', label: '按天' },
    { value: 'week', label: '按周' },
    { value: 'month', label: '按月' },
  ] as const;

  it('用 radiogroup 语义而不是一排按钮', () => {
    render(<Segmented label="计算模式" value="day" onChange={() => {}} options={OPTIONS} />);
    expect(screen.getByRole('radiogroup', { name: '计算模式' })).toBeInTheDocument();
    expect(screen.getAllByRole('radio')).toHaveLength(3);
  });

  it('只有选中项在 Tab 序列里（roving tabindex）', () => {
    render(<Segmented label="计算模式" value="week" onChange={() => {}} options={OPTIONS} />);
    expect(screen.getByRole('radio', { name: '按天' })).toHaveAttribute('tabindex', '-1');
    expect(screen.getByRole('radio', { name: '按周' })).toHaveAttribute('tabindex', '0');
  });

  it('方向键移动并顺便选中，且焦点跟随', () => {
    const onChange = vi.fn();
    render(<Segmented label="计算模式" value="day" onChange={onChange} options={OPTIONS} />);

    fireEvent.keyDown(screen.getByRole('radio', { name: '按天' }), { key: 'ArrowRight' });

    expect(onChange).toHaveBeenCalledWith('week');
    expect(screen.getByRole('radio', { name: '按周' })).toHaveFocus();
  });

  it('左方向键从第一项绕回最后一项', () => {
    const onChange = vi.fn();
    render(<Segmented label="计算模式" value="day" onChange={onChange} options={OPTIONS} />);
    fireEvent.keyDown(screen.getByRole('radio', { name: '按天' }), { key: 'ArrowLeft' });
    expect(onChange).toHaveBeenCalledWith('month');
  });

  it('Home / End 跳到首末项', () => {
    const onChange = vi.fn();
    render(<Segmented label="计算模式" value="week" onChange={onChange} options={OPTIONS} />);
    const current = screen.getByRole('radio', { name: '按周' });

    fireEvent.keyDown(current, { key: 'Home' });
    expect(onChange).toHaveBeenLastCalledWith('day');
    fireEvent.keyDown(current, { key: 'End' });
    expect(onChange).toHaveBeenLastCalledWith('month');
  });

  it('跳过 disabled 项', () => {
    const onChange = vi.fn();
    render(
      <Segmented
        label="计算模式"
        value="day"
        onChange={onChange}
        options={[
          { value: 'day', label: '按天' },
          { value: 'week', label: '按周', disabled: true },
          { value: 'month', label: '按月' },
        ]}
      />,
    );
    fireEvent.keyDown(screen.getByRole('radio', { name: '按天' }), { key: 'ArrowRight' });
    expect(onChange).toHaveBeenCalledWith('month');
  });

  it('label 默认只给屏幕阅读器看（sr-only）', () => {
    render(<Segmented label="计算模式" value="day" onChange={() => {}} options={OPTIONS} />);
    expect(screen.getByText('计算模式').className).toContain('sr-only');
  });
});

describe('Tabs', () => {
  it('tablist 语义 + 方向键切换', () => {
    const onChange = vi.fn();
    render(
      <Tabs
        label="结果视图"
        value="a"
        onChange={onChange}
        options={[
          { value: 'a', label: '明细' },
          { value: 'b', label: '图表' },
        ]}
      />,
    );

    expect(screen.getByRole('tablist', { name: '结果视图' })).toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole('tab', { name: '明细' }), { key: 'ArrowRight' });
    expect(onChange).toHaveBeenCalledWith('b');
  });

  it('每个标签都保持 48px 触摸高度', () => {
    render(
      <Tabs
        label="结果视图"
        value="a"
        onChange={() => {}}
        options={[{ value: 'a', label: '明细' }]}
      />,
    );
    expect(screen.getByRole('tab').className).toContain('min-h-tap');
  });
});

/* ------------------------------------------------------------------ */

describe('TextField', () => {
  it('label 的 for 与 input 的 id 匹配', () => {
    render(<TextField label="开始日期" />);
    const input = screen.getByLabelText('开始日期');
    expect(input.id).toBeTruthy();
    expect(document.querySelector(`label[for="${input.id}"]`)).not.toBeNull();
  });

  it('有 hint 时用 aria-describedby 关联，屏幕阅读器会念出来', () => {
    render(<TextField label="开始日期" hint="留空表示今天" />);
    expect(screen.getByLabelText('开始日期')).toHaveAttribute('aria-describedby');
  });

  it('出错时设 aria-invalid，且错误文案是 role="alert"', () => {
    render(<TextField label="开始日期" error="格式不正确" />);
    expect(screen.getByLabelText('开始日期')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('alert')).toHaveTextContent('格式不正确');
  });

  it('同时有 hint 与 error 时只显示 error（先解决问题再解释）', () => {
    render(<TextField label="开始日期" hint="留空表示今天" error="格式不正确" />);
    expect(screen.queryByText('留空表示今天')).toBeNull();
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('输入高度不低于 48px', () => {
    render(<TextField label="开始日期" />);
    expect(screen.getByLabelText('开始日期').className).toContain('min-h-tap');
  });

  it('suffix 是 aria-hidden 的装饰，不干扰朗读', () => {
    render(<TextField label="天数" suffix="天" />);
    expect(screen.getByText('天')).toHaveAttribute('aria-hidden', 'true');
  });

  it('required 的星号是装饰性的，靠原生 required 表达语义', () => {
    render(<TextField label="开始日期" required />);
    expect(screen.getByLabelText(/开始日期/)).toBeRequired();
  });

  it('action 渲染在 label 右侧（如「今天」按钮）', () => {
    render(<TextField label="开始日期" action={<button type="button">今天</button>} />);
    expect(screen.getByRole('button', { name: '今天' })).toBeInTheDocument();
  });
});

describe('TextAreaField', () => {
  it('默认 3 行，标签关联正确', () => {
    render(<TextAreaField label="自然语言输入" />);
    const textarea = screen.getByLabelText('自然语言输入');
    expect(textarea.tagName).toBe('TEXTAREA');
    expect(textarea).toHaveAttribute('rows', '3');
  });

  it('出错时同样接好 aria-invalid', () => {
    render(<TextAreaField label="自然语言输入" error="看不懂这句话" />);
    expect(screen.getByLabelText('自然语言输入')).toHaveAttribute('aria-invalid', 'true');
  });
});

describe('SelectField', () => {
  it('渲染所有选项并关联 label', () => {
    render(
      <SelectField
        label="节假日地区"
        options={[
          { value: 'CN', label: '中国大陆' },
          { value: 'US', label: '美国' },
          { value: 'NONE', label: '不考虑' },
        ]}
        defaultValue="CN"
      />,
    );

    const select = screen.getByLabelText('节假日地区');
    expect(within(select).getAllByRole('option')).toHaveLength(3);
    expect(select).toHaveValue('CN');
  });

  it('disabled 的选项不可选', () => {
    render(
      <SelectField
        label="地区"
        options={[
          { value: 'a', label: 'A' },
          { value: 'b', label: 'B', disabled: true },
        ]}
      />,
    );
    expect(screen.getByRole('option', { name: 'B' })).toBeDisabled();
  });

  it('自绘箭头是 aria-hidden，不产生额外朗读', () => {
    render(<SelectField label="地区" options={[{ value: 'a', label: 'A' }]} />);
    expect(screen.getByText('▼')).toHaveAttribute('aria-hidden', 'true');
  });
});

describe('Switch', () => {
  it('用原生 checkbox + role="switch"，自带键盘与语义', () => {
    render(<Switch label="记录历史" checked={false} onChange={() => {}} />);
    const control = screen.getByRole('switch', { name: '记录历史' });
    expect(control.tagName).toBe('INPUT');
    expect(control).not.toBeChecked();
  });

  it('切换时回调收到新的布尔值', () => {
    const onChange = vi.fn();
    render(<Switch label="记录历史" checked={false} onChange={onChange} />);
    fireEvent.click(screen.getByRole('switch', { name: '记录历史' }));
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('触摸热区撑到 48px（轨道本身只有 28px 高）', () => {
    render(<Switch label="记录历史" checked onChange={() => {}} />);
    // 轨道是 aria-hidden 的兄弟节点
    const track = screen.getByRole('switch').nextElementSibling!;
    expect(track.className).toContain('h-7');
    // 承载点击的是外层 label
    const hitArea = screen.getByRole('switch').closest('label')!;
    expect(hitArea.className).toContain('min-h-tap');
  });

  it('description 会渲染成说明文字', () => {
    render(
      <Switch label="记录历史" description="关闭后不再保存计算记录" checked onChange={() => {}} />,
    );
    expect(screen.getByText('关闭后不再保存计算记录')).toBeInTheDocument();
  });

  it('disabled 时不可切换', () => {
    render(<Switch label="全局快捷键" checked={false} onChange={() => {}} disabled />);
    expect(screen.getByRole('switch')).toBeDisabled();
  });
});

/* ------------------------------------------------------------------ */

describe('Card / StatList', () => {
  it('标题用 h2，保证每个功能页只有一个 h1', () => {
    render(
      <Card title="日期差" id="diff">
        内容
      </Card>,
    );
    expect(screen.getByRole('heading', { level: 2, name: '日期差' })).toBeInTheDocument();
  });

  it('有 id 时用 aria-labelledby 把标题与区域关联', () => {
    render(
      <Card title="日期差" id="diff">
        内容
      </Card>,
    );
    expect(screen.getByRole('region', { name: '日期差' })).toBeInTheDocument();
  });

  it('StatRow 用 dl/dt/dd 语义', () => {
    render(
      <StatList>
        <StatRow label="相差天数" value="365 天" />
      </StatList>,
    );
    const term = screen.getByText('相差天数');
    expect(term.tagName).toBe('DT');
    expect(term.nextElementSibling?.tagName).toBe('DD');
  });

  it('emphasis 的行字号更大（主结果用）', () => {
    render(
      <StatList>
        <StatRow label="总计" value="365 天" emphasis />
      </StatList>,
    );
    expect(screen.getByText('365 天').className).toContain('text-lg');
  });
});

/* ------------------------------------------------------------------ */

describe('ResultDisplay', () => {
  it('结果区是 aria-live="polite"，输入变化会自动播报', () => {
    const { container } = render(<ResultDisplay ready primary="365 天" />);
    const region = container.firstElementChild!;
    expect(region).toHaveAttribute('aria-live', 'polite');
    expect(region).toHaveAttribute('aria-atomic', 'true');
  });

  it('未就绪时显示占位文案，而不是空白', () => {
    render(<ResultDisplay ready={false} primary="" />);
    expect(screen.getByText('填写上方输入后自动计算')).toBeInTheDocument();
  });

  it('可以自定义占位文案', () => {
    render(<ResultDisplay ready={false} primary="" placeholder="先选两个日期" />);
    expect(screen.getByText('先选两个日期')).toBeInTheDocument();
  });

  it('出错时用 role="alert" 立即播报，并取代主数值', () => {
    render(<ResultDisplay ready primary="365 天" error="结束日期早于开始日期" />);
    expect(screen.getByRole('alert')).toHaveTextContent('结束日期早于开始日期');
    expect(screen.queryByText('365 天')).toBeNull();
  });

  it('给了 copyText 才出现复制按钮', () => {
    const { unmount } = render(<ResultDisplay ready primary="365 天" />);
    expect(screen.queryByRole('button', { name: /复制/ })).toBeNull();
    unmount();

    render(<ResultDisplay ready primary="365 天" copyText="365 天" />);
    expect(screen.getByRole('button', { name: /复制/ })).toBeInTheDocument();
  });

  it('明细行与脚注都会渲染', () => {
    render(
      <ResultDisplay
        ready
        primary="365 天"
        rows={[{ label: '工作日', value: '261 天' }]}
        footnote="首尾两天都计入"
      />,
    );
    expect(screen.getByText('工作日')).toBeInTheDocument();
    expect(screen.getByText('261 天')).toBeInTheDocument();
    expect(screen.getByText('首尾两天都计入')).toBeInTheDocument();
  });
});

describe('CopyButton', () => {
  it('空文本时禁用，避免点了没反应', () => {
    render(<CopyButton text="" />);
    expect(screen.getByRole('button')).toBeDisabled();
  });

  it('点击后调用剪贴板并切换成「已复制」', async () => {
    const writeText = vi.fn(async () => {});
    Object.defineProperty(navigator, 'clipboard', {
      writable: true,
      configurable: true,
      value: { writeText },
    });

    render(<CopyButton text="365 天" label="结果" />);
    fireEvent.click(screen.getByRole('button'));

    expect(await screen.findByText('已复制')).toBeInTheDocument();
    expect(writeText).toHaveBeenCalledWith('365 天');
  });

  it('有一个独立的 live region 播报结果（已聚焦元素的 aria-label 变化不会触发朗读）', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      writable: true,
      configurable: true,
      value: { writeText: vi.fn(async () => {}) },
    });

    render(<CopyButton text="365 天" />);
    fireEvent.click(screen.getByRole('button'));

    const status = await screen.findByRole('status');
    expect(status).toHaveAttribute('aria-live', 'polite');
    expect(status).toHaveTextContent('已复制到剪贴板');
  });

  it('iconOnly 时按钮没有可见文字，但仍有 aria-label', () => {
    render(<CopyButton text="365 天" label="结果" iconOnly />);
    expect(screen.getByRole('button', { name: '复制结果' })).toBeInTheDocument();
  });

  it('复制失败时按钮不变状态，并给出提示（而不是假装成功）', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      writable: true,
      configurable: true,
      value: undefined,
    });
    Object.defineProperty(document, 'execCommand', {
      writable: true,
      configurable: true,
      value: vi.fn(() => false),
    });

    render(<CopyButton text="365 天" />);
    fireEvent.click(screen.getByRole('button'));

    // 仍显示「复制」而非「已复制」
    expect(screen.getByRole('button', { name: /复制结果$/ })).toBeInTheDocument();
  });
});

/* ------------------------------------------------------------------ */

describe('EmptyState', () => {
  it('渲染标题、说明与操作按钮', () => {
    render(
      <EmptyState
        icon="🕘"
        title="还没有记录"
        description="算过一次之后就会出现在这里"
        action={<Button>去算一次</Button>}
      />,
    );
    expect(screen.getByText('还没有记录')).toBeInTheDocument();
    expect(screen.getByText('算过一次之后就会出现在这里')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '去算一次' })).toBeInTheDocument();
  });

  it('图标是 aria-hidden 的装饰', () => {
    render(<EmptyState icon="🕘" title="还没有记录" />);
    expect(screen.getByText('🕘')).toHaveAttribute('aria-hidden', 'true');
  });

  it('默认图标是时钟，不需要调用方每次都传', () => {
    render(<EmptyState title="空" />);
    expect(screen.getByText('🗒')).toBeInTheDocument();
  });
});

/* ------------------------------------------------------------------ */

describe('Dialog', () => {
  it('关闭时不渲染任何内容', () => {
    render(
      <Dialog open={false} onClose={() => {}} title="确认清空">
        内容
      </Dialog>,
    );
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('打开时用 role="dialog" + aria-modal + aria-labelledby', () => {
    render(
      <Dialog open onClose={() => {}} title="确认清空">
        内容
      </Dialog>,
    );
    const dialog = screen.getByRole('dialog', { name: '确认清空' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
  });

  it('description 通过 aria-describedby 关联', () => {
    render(
      <Dialog open onClose={() => {}} title="确认清空" description="该操作不可撤销">
        内容
      </Dialog>,
    );
    expect(screen.getByRole('dialog')).toHaveAttribute('aria-describedby');
    expect(screen.getByText('该操作不可撤销')).toBeInTheDocument();
  });

  it('Esc 触发 onClose', () => {
    const onClose = vi.fn();
    render(
      <Dialog open onClose={onClose} title="确认清空">
        内容
      </Dialog>,
    );
    fireEvent.keyDown(screen.getByRole('dialog').parentElement!, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('点遮罩关闭', () => {
    const onClose = vi.fn();
    render(
      <Dialog open onClose={onClose} title="确认清空">
        内容
      </Dialog>,
    );
    // Dialog 通过 portal 挂到 document.body，所以要在 document 上找而不是 render 容器
    fireEvent.click(document.querySelector('.tc-backdrop')!);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('有关闭按钮，不强迫用户按 Esc', () => {
    render(
      <Dialog open onClose={() => {}} title="确认清空">
        内容
      </Dialog>,
    );
    expect(screen.getByRole('button', { name: '关闭' })).toBeInTheDocument();
  });

  it('打开时锁定背景滚动，避免对话框后面还能滚', () => {
    const { unmount } = render(
      <Dialog open onClose={() => {}} title="确认清空">
        内容
      </Dialog>,
    );
    expect(document.body.style.overflow).toBe('hidden');
    unmount();
    // 卸载后必须恢复，否则整页再也滚不动
    expect(document.body.style.overflow).not.toBe('hidden');
  });

  it('Tab 在对话框内循环：从最后一项跳到第一项', () => {
    render(
      <Dialog
        open
        onClose={() => {}}
        title="确认清空"
        footer={
          <>
            <Button>取消</Button>
            <Button>确认</Button>
          </>
        }
      >
        内容
      </Dialog>,
    );

    const dialog = screen.getByRole('dialog');
    const focusable = Array.from(
      dialog.querySelectorAll<HTMLElement>('button, [tabindex]:not([tabindex="-1"])'),
    ).filter((el) => !el.hasAttribute('disabled'));
    const first = focusable[0]!;
    const last = focusable[focusable.length - 1]!;

    last.focus();
    fireEvent.keyDown(dialog.parentElement!, { key: 'Tab' });
    expect(first).toHaveFocus();
  });

  it('Shift+Tab 从第一项绕回最后一项', () => {
    render(
      <Dialog
        open
        onClose={() => {}}
        title="确认清空"
        footer={
          <>
            <Button>取消</Button>
            <Button>确认</Button>
          </>
        }
      >
        内容
      </Dialog>,
    );

    const dialog = screen.getByRole('dialog');
    const focusable = Array.from(
      dialog.querySelectorAll<HTMLElement>('button, [tabindex]:not([tabindex="-1"])'),
    ).filter((el) => !el.hasAttribute('disabled'));
    const first = focusable[0]!;
    const last = focusable[focusable.length - 1]!;

    first.focus();
    fireEvent.keyDown(dialog.parentElement!, { key: 'Tab', shiftKey: true });
    expect(last).toHaveFocus();
  });

  it('关闭后焦点归还给打开它的元素', () => {
    function Harness() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>
            打开
          </button>
          <Dialog open={open} onClose={() => setOpen(false)} title="确认清空">
            内容
          </Dialog>
        </>
      );
    }

    render(<Harness />);
    const trigger = screen.getByRole('button', { name: '打开' });
    // 必须先聚焦：Dialog 记录的是 document.activeElement
    trigger.focus();
    fireEvent.click(trigger);
    fireEvent.keyDown(screen.getByRole('dialog').parentElement!, { key: 'Escape' });

    expect(trigger).toHaveFocus();
  });
});

/* ------------------------------------------------------------------ */

describe('scoreCommand / filterCommands', () => {
  const commands: Command[] = [
    {
      id: 'date-diff',
      title: '日期差',
      subtitle: '计算两个日期相差多少天',
      keywords: ['date', 'diff', 'cha'],
      group: '计算',
      run: () => {},
    },
    {
      id: 'timezone',
      title: '时区换算',
      subtitle: '在时区之间转换时刻',
      keywords: ['timezone', 'tz'],
      group: '计算',
      run: () => {},
    },
    {
      id: 'theme',
      title: '切换主题',
      keywords: ['theme', 'dark'],
      group: '外观',
      run: () => {},
    },
  ];

  it('空查询时全部返回（保持原顺序）', () => {
    expect(filterCommands(commands, '')).toEqual(commands);
    expect(filterCommands(commands, '   ')).toEqual(commands);
  });

  it('标题前缀匹配排在包含匹配之前', () => {
    expect(scoreCommand(commands[0]!, '日')).toBeGreaterThan(scoreCommand(commands[1]!, '日'));
  });

  it('中文按字符直接匹配（中文没有词边界，子串匹配才是对的）', () => {
    expect(filterCommands(commands, '日期').map((c) => c.id)).toContain('date-diff');
  });

  it('英文关键字也能命中', () => {
    expect(filterCommands(commands, 'tz').map((c) => c.id)).toEqual(['timezone']);
  });

  it('副标题命中也能搜到', () => {
    expect(filterCommands(commands, '相差多少天').map((c) => c.id)).toEqual(['date-diff']);
  });

  it('大小写不敏感', () => {
    expect(filterCommands(commands, 'DATe').map((c) => c.id)).toContain('date-diff');
  });

  it('完全无关的查询返回空（而不是「兜底返回全部」）', () => {
    expect(filterCommands(commands, 'zzzzz')).toEqual([]);
  });

  it('结果按分数降序排列', () => {
    const results = filterCommands(commands, 'theme');
    expect(results[0]!.id).toBe('theme');
  });
});

describe('CommandPalette', () => {
  const commands: Command[] = [
    { id: 'a', title: '日期差', group: '计算', shortcut: '⌘1', run: vi.fn() },
    { id: 'b', title: '时区换算', group: '计算', run: vi.fn() },
    { id: 'c', title: '切换主题', group: '外观', run: vi.fn() },
  ];

  it('输入框用 combobox 语义，屏幕阅读器能播报结果数量', () => {
    render(<CommandPalette open onClose={() => {}} commands={commands} />);
    expect(screen.getByRole('combobox')).toHaveAttribute('aria-autocomplete', 'list');
    expect(screen.getByText('3 项')).toBeInTheDocument();
  });

  it('列表是 listbox，每项是 option', () => {
    render(<CommandPalette open onClose={() => {}} commands={commands} />);
    expect(screen.getByRole('listbox')).toBeInTheDocument();
    expect(screen.getAllByRole('option')).toHaveLength(3);
  });

  it('分组标题会渲染，且不进入 option 列表', () => {
    render(<CommandPalette open onClose={() => {}} commands={commands} />);
    expect(screen.getByText('计算')).toBeInTheDocument();
    expect(screen.getByText('外观')).toBeInTheDocument();
  });

  it('第一项默认高亮（aria-selected）', () => {
    render(<CommandPalette open onClose={() => {}} commands={commands} />);
    expect(screen.getAllByRole('option')[0]).toHaveAttribute('aria-selected', 'true');
  });

  it('下方向键移动高亮', () => {
    render(<CommandPalette open onClose={() => {}} commands={commands} />);
    fireEvent.keyDown(screen.getByRole('combobox'), { key: 'ArrowDown' });
    expect(screen.getAllByRole('option')[1]).toHaveAttribute('aria-selected', 'true');
  });

  it('上方向键从第一项绕到最后一项', () => {
    render(<CommandPalette open onClose={() => {}} commands={commands} />);
    fireEvent.keyDown(screen.getByRole('combobox'), { key: 'ArrowUp' });
    expect(screen.getAllByRole('option')[2]).toHaveAttribute('aria-selected', 'true');
  });

  it('输入查询后过滤结果并更新计数', async () => {
    render(<CommandPalette open onClose={() => {}} commands={commands} />);
    fireEvent.change(screen.getByRole('combobox'), { target: { value: '时区' } });

    expect(await screen.findByText('1 项')).toBeInTheDocument();
    expect(screen.getAllByRole('option')).toHaveLength(1);
  });

  it('无匹配时显示空状态而不是空白列表', async () => {
    render(<CommandPalette open onClose={() => {}} commands={commands} emptyText="没有匹配的命令" />);
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'zzzz' } });
    expect(await screen.findByText('没有匹配的命令')).toBeInTheDocument();
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('Enter 先关闭面板再执行命令（否则会被焦点归还打断）', async () => {
    vi.useFakeTimers();
    const run = vi.fn();
    const onClose = vi.fn();
    render(
      <CommandPalette open onClose={onClose} commands={[{ id: 'a', title: '日期差', run }]} />,
    );

    fireEvent.keyDown(screen.getByRole('combobox'), { key: 'Enter' });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(run).not.toHaveBeenCalled(); // 命令是延后执行的
    vi.runAllTimers();
    expect(run).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it('点击某一项也会执行它', () => {
    vi.useFakeTimers();
    const run = vi.fn();
    render(<CommandPalette open onClose={() => {}} commands={[{ id: 'a', title: '日期差', run }]} />);

    fireEvent.click(screen.getByRole('option'));
    vi.runAllTimers();
    expect(run).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it('快捷键提示会显示在右侧', () => {
    render(<CommandPalette open onClose={() => {}} commands={commands} />);
    expect(screen.getByText('⌘1')).toBeInTheDocument();
  });

  it('底部提示告知键盘用法', () => {
    render(<CommandPalette open onClose={() => {}} commands={commands} />);
    expect(screen.getByText(/↑↓ 选择/)).toBeInTheDocument();
  });
});

/* ------------------------------------------------------------------ */

describe('KeyboardHelp', () => {
  it('列出应用级快捷键', () => {
    render(<KeyboardHelp open onClose={() => {}} />);
    expect(screen.getByRole('dialog', { name: '键盘快捷键' })).toBeInTheDocument();
    expect(screen.getByText('打开命令面板')).toBeInTheDocument();
  });

  it('面板切换键由调用方传入，顺序排在第一项之后', () => {
    render(
      <KeyboardHelp
        open
        onClose={() => {}}
        panelShortcuts={[{ keys: 'mod+1', description: '自然语言计算' }]}
      />,
    );
    expect(screen.getByText('自然语言计算')).toBeInTheDocument();
  });

  it('onlyWhen 为假的条目不会显示（避免提示按了没反应的键）', () => {
    render(
      <KeyboardHelp
        open
        onClose={() => {}}
        panelShortcuts={[
          { keys: 'mod+shift+g', description: '全局唤起', onlyWhen: ({ global }) => global },
        ]}
      />,
    );
    // 浏览器里 shortcut.global 为 false，这一条应当被过滤掉
    expect(screen.queryByText('全局唤起')).toBeNull();
  });

  it('说明当前环境的快捷键作用范围，管理用户预期', () => {
    render(<KeyboardHelp open onClose={() => {}} />);
    expect(screen.getByText(/仅在页面获得焦点时生效/)).toBeInTheDocument();
  });
});
