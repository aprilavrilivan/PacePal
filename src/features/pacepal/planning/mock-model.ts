import type {
  Assignment,
  AssignmentInput,
  Subtask,
} from "@/features/pacepal/model";
import type {
  DraftTask,
  InitialPlanDecision,
  PlanOperation,
  RefinementDecision,
} from "@/features/pacepal/planning/contracts";

export function detectPlanningLanguage(value: string): "zh" | "en" {
  const chineseCharacters = value.match(/[\u3400-\u9fff]/g)?.length ?? 0;
  const latinWords = value.match(/[A-Za-z]{2,}/g)?.length ?? 0;
  return chineseCharacters >= Math.max(2, latinWords) ? "zh" : "en";
}

function draft(
  tempId: string,
  title: string,
  description: string,
  completionCriteria: string,
  estimatedMinutes: number,
  difficulty: DraftTask["difficulty"],
  priority: DraftTask["priority"],
  dependencies: string[],
): DraftTask {
  return {
    tempId,
    title,
    description,
    estimatedMinutes,
    completionCriteria,
    difficulty,
    priority,
    dependencies,
  };
}

export function generateMockInitialDecision(
  assignment: AssignmentInput,
): InitialPlanDecision {
  const language = detectPlanningLanguage(
    `${assignment.title} ${assignment.requirements} ${assignment.deliverable}`,
  );

  if (language === "zh") {
    return {
      language,
      taskUnderstanding: `你需要在 ${assignment.deadline} 前完成“${assignment.title}”，最终成果是${assignment.deliverable}。下面先按理解要求、准备内容、完成产出和提交检查四个阶段安排。`,
      assumptions: ["当前尚未开始；如果已有进度，可以直接告诉我调整。"],
      phases: [
        {
          id: "understand",
          title: "理解与定向",
          tasks: [
            draft(
              "understand-requirements",
              "理解任务要求",
              `提取目标、范围、评价标准和提交限制：${assignment.requirements}`,
              "形成一份明确的要求与限制清单。",
              25,
              "low",
              "high",
              [],
            ),
            draft(
              "define-approach",
              "确定完成思路",
              "明确核心问题、方法和最终成果的结构。",
              "写出可执行的工作思路和成果结构。",
              35,
              "medium",
              "high",
              ["understand-requirements"],
            ),
          ],
        },
        {
          id: "prepare",
          title: "资料与结构",
          tasks: [
            draft(
              "collect-materials",
              "收集并筛选必要资料",
              "围绕任务要求查找可靠资料，并记录与目标直接相关的信息。",
              "关键资料已归档，并标明各自用途。",
              90,
              "medium",
              "high",
              ["define-approach"],
            ),
            draft(
              "organize-evidence",
              "整理要点与证据",
              "把资料按主要观点或成果部分归类，识别缺口。",
              "每个主要部分都有可用要点或证据。",
              60,
              "medium",
              "medium",
              ["collect-materials"],
            ),
            draft(
              "build-outline",
              "完成详细大纲",
              "把目标、关键内容和逻辑顺序落实为详细大纲。",
              "大纲覆盖最终成果的全部主要部分。",
              50,
              "medium",
              "high",
              ["organize-evidence"],
            ),
          ],
        },
        {
          id: "produce",
          title: "产出",
          tasks: [
            draft(
              "first-draft",
              "完成第一版成果",
              `依照大纲完成${assignment.deliverable}的第一版，先保证内容完整。`,
              "第一版覆盖大纲中的全部核心内容。",
              150,
              "high",
              "high",
              ["build-outline"],
            ),
            draft(
              "substantive-revision",
              "进行内容与结构修改",
              "检查逻辑、证据、完整性和任务要求，修复主要问题。",
              "关键论点清楚，内容完整且符合要求。",
              75,
              "high",
              "high",
              ["first-draft"],
            ),
          ],
        },
        {
          id: "finish",
          title: "核对与提交",
          tasks: [
            draft(
              "final-check",
              "最终核对并提交",
              "校对语言和格式，逐项检查要求、文件与提交方式后完成提交。",
              "最终文件无明显错误，要求已逐项核对并成功提交。",
              45,
              "medium",
              "high",
              ["substantive-revision"],
            ),
          ],
        },
      ],
    };
  }

  return {
    language,
    taskUnderstanding: `You need to complete “${assignment.title}” by ${assignment.deadline}, producing ${assignment.deliverable}. The proposal moves from clarifying the requirements through preparation, production, and final delivery checks.`,
    assumptions: [
      "This starts from no completed work; tell me what is already done and I will preserve it.",
    ],
    phases: [
      {
        id: "understand",
        title: "Understand and frame",
        tasks: [
          draft(
            "understand-requirements",
            "Clarify the task requirements",
            `Extract the objective, scope, evaluation criteria, and submission constraints from: ${assignment.requirements}`,
            "A concise requirements and constraints checklist is ready.",
            25,
            "low",
            "high",
            [],
          ),
          draft(
            "define-approach",
            "Choose a workable approach",
            "Define the central question, method, and structure of the deliverable.",
            "A clear approach and deliverable structure are written down.",
            35,
            "medium",
            "high",
            ["understand-requirements"],
          ),
        ],
      },
      {
        id: "prepare",
        title: "Research and structure",
        tasks: [
          draft(
            "collect-materials",
            "Collect and screen essential material",
            "Find reliable material that directly supports the task and record how each source will be used.",
            "The essential material is organized with a clear purpose for each item.",
            90,
            "medium",
            "high",
            ["define-approach"],
          ),
          draft(
            "organize-evidence",
            "Organize key points and evidence",
            "Group the material by claim or deliverable section and identify any gaps.",
            "Every major section has supporting points or evidence.",
            60,
            "medium",
            "medium",
            ["collect-materials"],
          ),
          draft(
            "build-outline",
            "Build a detailed outline",
            "Turn the objective and supporting material into a complete working outline.",
            "The outline covers every major part of the final deliverable.",
            50,
            "medium",
            "high",
            ["organize-evidence"],
          ),
        ],
      },
      {
        id: "produce",
        title: "Produce and revise",
        tasks: [
          draft(
            "first-draft",
            "Complete the first full version",
            `Use the outline to produce a complete first version of ${assignment.deliverable}.`,
            "The first version covers all core content from the outline.",
            150,
            "high",
            "high",
            ["build-outline"],
          ),
          draft(
            "substantive-revision",
            "Revise content and structure",
            "Check logic, evidence, completeness, and the original requirements, then fix the major issues.",
            "The result is complete, coherent, and meets the stated requirements.",
            75,
            "high",
            "high",
            ["first-draft"],
          ),
        ],
      },
      {
        id: "finish",
        title: "Verify and deliver",
        tasks: [
          draft(
            "final-check",
            "Run the final check and submit",
            "Proofread, verify formatting and every requirement, then complete the submission process.",
            "The final file is checked against every requirement and submitted successfully.",
            45,
            "medium",
            "high",
            ["substantive-revision"],
          ),
        ],
      },
    ],
  };
}

function normalized(value: string) {
  return value.toLocaleLowerCase().replace(/[\s\p{P}\p{S}]+/gu, "");
}

function mentionedTasks(assignment: Assignment, message: string) {
  const compactMessage = normalized(message);
  const messageWords = new Set(
    message.toLocaleLowerCase().match(/[a-z0-9]{4,}/g) ?? [],
  );
  return assignment.subtasks.filter((task) => {
    const compactTitle = normalized(task.title);
    if (
      compactTitle.length >= 2 &&
      (compactMessage.includes(compactTitle) ||
        compactTitle.includes(compactMessage))
    ) {
      return true;
    }
    const titleWords =
      task.title.toLocaleLowerCase().match(/[a-z0-9]{4,}/g) ?? [];
    return titleWords.some((word) => messageWords.has(word));
  });
}

function firstActionableTask(assignment: Assignment) {
  return (
    assignment.subtasks.find((task) => task.status === "in_progress") ??
    assignment.subtasks.find((task) => task.status !== "completed") ??
    null
  );
}

function noChange(
  language: "zh" | "en",
  intent: RefinementDecision["intent"],
  assistantMessage: string,
): RefinementDecision {
  return {
    language,
    intent,
    assistantMessage,
    confirmation: "not_required",
    operations: [],
  };
}

function splitOperations(
  task: Subtask,
  language: "zh" | "en",
): PlanOperation[] {
  const firstId = `new-${slugForTemp(task.id)}-prepare`;
  const secondId = `new-${slugForTemp(task.id)}-finish`;
  const phase = task.phase ?? (language === "zh" ? "执行" : "Execution");
  return [
    {
      type: "split_task",
      taskId: task.id,
      tasks: [
        {
          tempId: firstId,
          phase,
          title:
            language === "zh"
              ? `${task.title}：准备`
              : `${task.title}: prepare`,
          description:
            language === "zh"
              ? `先整理完成“${task.title}”所需的输入、判断标准和下一步。`
              : `Prepare the inputs, decision criteria, and next action needed for “${task.title}”.`,
          estimatedMinutes: Math.max(
            10,
            Math.round((task.estimatedMinutes * 0.35) / 5) * 5,
          ),
          completionCriteria:
            language === "zh"
              ? "所需输入已就绪，下一步明确。"
              : "The inputs are ready and the next action is clear.",
          difficulty: task.difficulty,
          priority: task.taskPriority ?? "medium",
          dependencies: [...task.dependencies],
        },
        {
          tempId: secondId,
          phase,
          title:
            language === "zh"
              ? `${task.title}：完成`
              : `${task.title}: complete`,
          description:
            language === "zh"
              ? `根据准备结果完成“${task.title}”的主要产出。`
              : `Complete the main output for “${task.title}” using the prepared inputs.`,
          estimatedMinutes: Math.max(
            10,
            task.estimatedMinutes -
              Math.max(10, Math.round((task.estimatedMinutes * 0.35) / 5) * 5),
          ),
          completionCriteria: task.completionCriteria,
          difficulty: task.difficulty,
          priority: task.taskPriority ?? "medium",
          dependencies: [firstId],
        },
      ],
    },
    { type: "reschedule" },
  ];
}

function slugForTemp(value: string) {
  return (
    value
      .toLocaleLowerCase()
      .replace(/[^a-z0-9\u4e00-\u9fff]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 32) || "task"
  );
}

export function generateMockRefinementDecision(
  assignment: Assignment,
  message: string,
): RefinementDecision {
  const language = detectPlanningLanguage(message);
  const mentioned = mentionedTasks(assignment, message);

  if (
    /(finished|completed|done|完成|做完)/i.test(message) &&
    /(haven.?t|have not|didn.?t|没有|没读|未读)/i.test(message) &&
    /(reference|source|文献|资料)/i.test(message)
  ) {
    return {
      language,
      intent: "progress_update",
      assistantMessage:
        language === "zh"
          ? "你一方面说相关工作已经完成，另一方面又说还没有阅读资料，这两个进度描述不一致。你是完成了资料收集，但还没有完成阅读与综述吗？"
          : "Those progress details conflict: you said the work is complete but also that the sources have not been read. Did you finish collecting the sources but not reading and reviewing them?",
      confirmation: "requested",
      operations: [],
    };
  }

  if (/reinforcement learning|强化学习/i.test(message)) {
    return noChange(
      language,
      "unrelated",
      language === "zh"
        ? "强化学习是一类让智能体通过与环境互动、根据奖励信号学习行为策略的方法。这个问题不需要改动你当前的任务计划。"
        : "Reinforcement learning is a method in which an agent learns a behavior policy through interaction and reward signals. This does not require changing your current plan.",
    );
  }

  if (/overwhelm|不知道从哪|无从下手|太难|压力很大/i.test(message)) {
    const task = firstActionableTask(assignment);
    return noChange(
      language,
      "difficulty",
      task
        ? language === "zh"
          ? `先不用考虑整个计划。现在只做一个很小的动作：打开“${task.title}”，用 10 分钟写下它需要的输入和第一个可交付结果。需要的话，我可以再把这一步拆小。`
          : `Ignore the whole plan for a moment. Open “${task.title}” and spend ten minutes listing its required inputs and first deliverable. I can split that step further if useful.`
        : language === "zh"
          ? "先不用解决全部问题。告诉我最卡住的那一步，我们只找一个十分钟内能开始的动作。"
          : "You do not need to solve everything now. Tell me which step feels most difficult and we will find one action you can start in ten minutes.",
    );
  }

  const completion =
    /(finished|completed|done|做完|完成了|已经完成|已完成)/i.test(message);
  if (completion && mentioned.length > 0) {
    const tasks = mentioned.filter((task) => task.status !== "completed");
    if (tasks.length > 0) {
      const operations: PlanOperation[] = [
        ...tasks.map((task): PlanOperation => ({
          type: "set_status",
          taskId: task.id,
          status: "completed",
        })),
        { type: "reschedule" },
      ];
      const names = tasks
        .map((task) => `“${task.title}”`)
        .join(language === "zh" ? "、" : ", ");
      return {
        language,
        intent: "progress_update",
        assistantMessage:
          language === "zh"
            ? `我理解为${names}已经完成。\n\n我已将${names}标记为完成，并会重新计算后续安排。`
            : `I understand that ${names} ${tasks.length === 1 ? "is" : "are"} complete. I marked ${names} complete and will recalculate the remaining schedule.`,
        confirmation: "not_required",
        operations,
      };
    }
  }

  if (/blocked|stuck|卡住|受阻|拿不到/i.test(message)) {
    const task =
      mentioned.find((item) => item.status !== "completed") ??
      firstActionableTask(assignment);
    if (task) {
      return {
        language,
        intent: "circumstance_change",
        assistantMessage:
          language === "zh"
            ? `明白，“${task.title}”目前受阻。我先把它标记为卡住，并重新安排不依赖它的工作。`
            : `Understood. “${task.title}” is blocked, so I marked it accordingly and will reschedule work that does not depend on it.`,
        confirmation: "not_required",
        operations: [
          { type: "set_status", taskId: task.id, status: "blocked" },
          { type: "reschedule" },
        ],
      };
    }
  }

  if (/拆小|细分|break.*down|more specific|更具体/i.test(message)) {
    const task =
      mentioned.find((item) => item.status !== "completed") ??
      firstActionableTask(assignment);
    if (task) {
      return {
        language,
        intent: "task_breakdown",
        assistantMessage:
          language === "zh"
            ? `我把“${task.title}”拆成准备和完成两个可执行步骤，其他任务保持不变。`
            : `I split “${task.title}” into a preparation step and a completion step while preserving the rest of the plan.`,
        confirmation: "not_required",
        operations: splitOperations(task, language),
      };
    }
  }

  const minuteMatch = message.match(
    /(?:每天|daily|per day)[^\d]{0,12}(\d{1,3})\s*(?:分钟|minutes?)/i,
  );
  const timeMatch = message.match(/\b([01]\d|2[0-3]):([0-5]\d)\b/);
  if (minuteMatch || timeMatch) {
    const dailyMinutes = minuteMatch ? Number(minuteMatch[1]) : undefined;
    const availability = {
      ...(dailyMinutes === undefined
        ? {}
        : { dailyMinutes: Math.min(240, Math.max(15, dailyMinutes)) }),
      ...(timeMatch
        ? { preferredTime: `${timeMatch[1]}:${timeMatch[2]}` }
        : {}),
    };
    return {
      language,
      intent: "circumstance_change",
      assistantMessage:
        language === "zh"
          ? "我已按你新的可用时间更新容量，并会重新计算剩余安排。"
          : "I updated your available study capacity and will recalculate the remaining schedule.",
      confirmation: "not_required",
      operations: [
        { type: "set_availability", availability },
        { type: "reschedule" },
      ],
    };
  }

  if (/删除|移除|delete|remove|合并|merge/i.test(message)) {
    return {
      language,
      intent: "plan_modification",
      assistantMessage:
        language === "zh"
          ? "这个改动可能删除或合并现有工作。请明确指出要处理的任务，并确认是否继续；在确认前我不会修改计划。"
          : "That change could remove or merge existing work. Please name the affected tasks and confirm that you want to continue; I will not change the plan before confirmation.",
      confirmation: "requested",
      operations: [],
    };
  }

  return noChange(
    language,
    /\?|？|怎么|如何|should|what|how/i.test(message)
      ? "question"
      : "plan_modification",
    language === "zh"
      ? "我理解你的想法，但还不能安全地判断具体要改哪一项。请告诉我任务名称，以及你希望它发生什么变化。"
      : "I understand the direction, but I cannot safely identify the exact plan change yet. Please name the task and the change you want.",
  );
}
