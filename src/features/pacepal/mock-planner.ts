import {
  assignmentInputSchema,
  subtaskSchema,
  type AssignmentInput,
  type Subtask,
} from "@/features/pacepal/model";

const planTemplate = [
  {
    title: "理解作业要求",
    description: "提取目标、格式、评分重点与提交要求。",
    estimatedMinutes: 25,
    completionCriteria: "整理出一份要求清单",
    difficulty: "low" as const,
  },
  {
    title: "确定主题与问题",
    description: "缩小主题范围，写出要回答的核心问题。",
    estimatedMinutes: 35,
    completionCriteria: "确定一个清晰的研究问题",
    difficulty: "medium" as const,
  },
  {
    title: "查找可靠资料",
    description: "检索与主题直接相关的学术或课程资料。",
    estimatedMinutes: 60,
    completionCriteria: "保存至少 5 个可用来源",
    difficulty: "medium" as const,
  },
  {
    title: "阅读并整理笔记",
    description: "记录每个来源的观点、证据与可引用位置。",
    estimatedMinutes: 90,
    completionCriteria: "每个来源都有简短笔记",
    difficulty: "medium" as const,
  },
  {
    title: "完成文章提纲",
    description: "安排论点、证据和各部分的顺序。",
    estimatedMinutes: 45,
    completionCriteria: "形成完整的段落级提纲",
    difficulty: "medium" as const,
  },
  {
    title: "撰写初稿",
    description: "根据提纲完成主要内容，暂不追求最终措辞。",
    estimatedMinutes: 180,
    completionCriteria: "完成一份可通读的初稿",
    difficulty: "high" as const,
  },
  {
    title: "修改结构与论证",
    description: "检查逻辑、证据与段落衔接，补齐缺口。",
    estimatedMinutes: 60,
    completionCriteria: "论点和证据完整连贯",
    difficulty: "high" as const,
  },
  {
    title: "校对并提交",
    description: "检查语言、引用、格式和提交文件。",
    estimatedMinutes: 35,
    completionCriteria: "文件符合要求并准备提交",
    difficulty: "low" as const,
  },
];

export function generateMockPlan(input: AssignmentInput): Subtask[] {
  const assignment = assignmentInputSchema.parse(input);
  const prefix = assignment.title
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 18);

  const proposal = planTemplate.map((item, index) => {
    const id = `${prefix || "assignment"}-task-${index + 1}`;
    const previousId =
      index === 0 ? undefined : `${prefix || "assignment"}-task-${index}`;

    return {
      ...item,
      id,
      dependencies: previousId ? [previousId] : [],
      status: "todo" as const,
    };
  });

  return subtaskSchema.array().parse(proposal);
}

export function normalizeDependencies(subtasks: Subtask[]): Subtask[] {
  return subtasks.map((subtask, index) => ({
    ...subtask,
    dependencies: index === 0 ? [] : [subtasks[index - 1].id],
  }));
}
