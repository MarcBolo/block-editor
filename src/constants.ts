import type { InsertActionId, InsertSpec, TurnIntoItem } from './types';

export const HANDLE_W = 20;
export const HANDLE_H = 20;

/** 「转换为」菜单项 */
export const TURN_INTO: TurnIntoItem[] = [
  ['paragraph', '正文'],
  ['h1', '标题 1'],
  ['h2', '标题 2'],
  ['h3', '标题 3'],
  ['h4', '标题 4'],
  ['h5', '标题 5'],
  ['h6', '标题 6'],
  ['ul', '无序列表'],
  ['ol', '有序列表'],
  ['todo', '待办清单'],
  ['quote', '引用'],
  ['callout', 'Callout'],
  ['toggle', '折叠块'],
  ['code', '代码块'],
  ['math', '数学公式'],
  ['table', '表格'],
  ['divider', '分割线'],
];

/** 块 ID 的词表：Obsidian 只认拉丁字母、数字和连字符，所以用「易拼写的短单词 + 序号」 */
export const ID_WORDS = [
  'amber', 'anchor', 'arbor', 'aspen', 'autumn', 'bamboo', 'beacon', 'birch', 'bloom', 'breeze',
  'brook', 'candle', 'canyon', 'cedar', 'cherry', 'cinder', 'clover', 'coral', 'cotton', 'dawn',
  'delta', 'drizzle', 'dusk', 'ember', 'falcon', 'fable', 'fern', 'flint', 'forest', 'frost',
  'garden', 'glacier', 'harbor', 'harvest', 'hazel', 'hollow', 'honey', 'indigo', 'ivory', 'jade',
  'lantern', 'linden', 'meadow', 'meteor', 'mirror', 'mist', 'nectar', 'north', 'orchid', 'pebble',
  'pepper', 'pine', 'pond', 'poppy', 'quartz', 'quill', 'raven', 'ribbon', 'river', 'saffron',
  'shadow', 'shell', 'silver', 'snow', 'spark', 'spring', 'stone', 'storm', 'summit', 'sunset',
  'thistle', 'tide', 'timber', 'valley', 'velvet', 'violet', 'walnut', 'willow', 'winter', 'zephyr',
];

/** Obsidian 官方 Callout 类型（canonical 名称，菜单用） */
export const CALLOUT_TYPES: [string, string][] = [
  ['note', '备注'],
  ['abstract', '摘要'],
  ['todo', '待办'],
  ['tip', '提示'],
  ['success', '成功'],
  ['question', '问题'],
  ['warning', '警告'],
  ['failure', '失败'],
  ['danger', '危险'],
  ['bug', '缺陷'],
  ['example', '示例'],
  ['quote', '引用'],
  // M5：更多官方 callout 类型
  ['cite', '引文'],
  ['info', '信息'],
  ['help', '帮助'],
  ['check', '完成'],
  ['cross', '否定'],
  ['key', '要点'],
  ['pencil', '笔记'],
  ['search', '检索'],
  ['love', '喜欢'],
  ['rocket', '启动'],
  ['image', '图片'],
  ['location', '位置'],
  ['home', '主页'],
  ['target', '目标'],
];

/** 代码块语言 */
export const CODE_LANGS: [string, string][] = [
  ['', '纯文本'],
  ['js', 'JavaScript'],
  ['ts', 'TypeScript'],
  ['python', 'Python'],
  ['java', 'Java'],
  ['c', 'C / C++'],
  ['go', 'Go'],
  ['rust', 'Rust'],
  ['sql', 'SQL'],
  ['bash', 'Bash'],
  ['json', 'JSON'],
  ['yaml', 'YAML'],
  ['html', 'HTML'],
  ['css', 'CSS'],
  ['mermaid', 'Mermaid'],
  // M5：代码语言扩展
  ['cpp', 'C++'],
  ['csharp', 'C#'],
  ['php', 'PHP'],
  ['ruby', 'Ruby'],
  ['swift', 'Swift'],
  ['kotlin', 'Kotlin'],
  ['dart', 'Dart'],
  ['shell', 'Shell'],
  ['powershell', 'PowerShell'],
  ['latex', 'LaTeX'],
  ['docker', 'Dockerfile'],
  ['xml', 'XML'],
  ['scss', 'SCSS'],
  ['less', 'Less'],
  ['graphql', 'GraphQL'],
];

/** 斜杠「插入类」动作（与 TURN_INTO 合并进斜杠建议列表） */
export const INSERT_ACTIONS: [InsertActionId, string][] = [
  ['image', '图片'],
  ['audio', '音频'],
  ['video', '视频'],
  ['pdf', 'PDF'],
  ['date', '日期'],
  ['time', '时间'],
  ['datetime', '日期时间'],
  ['math', '行内公式'],
  ['inlinecode', '行内代码'],
  ['highlight', '高亮'],
  ['note', '笔记链接'],
  ['embednote', '嵌入笔记'],
  ['blockref', '块引用'],
  ['blockembed', '嵌入块'],
];

/** 日期 / 时间格式默认值（token 说明见 insert-actions.ts 的 formatDateTime） */
export const DEFAULT_DATE_FORMAT = 'YYYY-MM-DD';
export const DEFAULT_TIME_FORMAT = 'HH:mm';

/** 媒体选择器的扩展名白名单（小写、不含点） */
export const MEDIA_EXTS: Record<'image' | 'audio' | 'video' | 'pdf', string[]> = {
  image: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'avif'],
  audio: ['mp3', 'wav', 'm4a', 'ogg', 'flac'],
  video: ['mp4', 'webm', 'mov', 'mkv', 'avi'],
  pdf: ['pdf'],
};

/**
 * 各插入动作怎么执行（BlockInserter 按 kind 分派）。与 INSERT_ACTIONS 一一对应。
 * 必须排在 MEDIA_EXTS 之后：对象字面量在模块求值时就会读取它。
 */
export const INSERT_SPECS: Record<InsertActionId, InsertSpec> = {
  image: { kind: 'pick', exts: MEDIA_EXTS.image },
  audio: { kind: 'pick', exts: MEDIA_EXTS.audio },
  video: { kind: 'pick', exts: MEDIA_EXTS.video },
  pdf: { kind: 'pick', exts: MEDIA_EXTS.pdf },
  date: { kind: 'dynamic', dyn: 'date' },
  time: { kind: 'dynamic', dyn: 'time' },
  datetime: { kind: 'dynamic', dyn: 'datetime' },
  // 光标落在两个标记中间（caret = 1 或 2），否则插完还得手动往回挪
  math: { kind: 'snippet', text: '$$', caret: 1 },
  inlinecode: { kind: 'snippet', text: '``', caret: 1 },
  highlight: { kind: 'snippet', text: '====', caret: 2 },
  note: { kind: 'note', embed: false },
  embednote: { kind: 'note', embed: true },
  blockref: { kind: 'blockref', embed: false },
  blockembed: { kind: 'blockref', embed: true },
};
