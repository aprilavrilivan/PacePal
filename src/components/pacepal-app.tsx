"use client";

import type { User } from "@supabase/supabase-js";
import { type FormEvent, useEffect, useMemo, useRef, useState } from "react";

import { CalendarMonthView } from "@/components/calendar-month-view";
import {
  loadCloudState,
  saveCloudState,
} from "@/features/pacepal/cloud-storage";
import {
  emptyAppState,
  type Assignment,
  type AssignmentInput,
  type AppState,
  type ChatMessage,
  type Energy,
  type Subtask,
} from "@/features/pacepal/model";
import { recommendAcrossAssignments } from "@/features/pacepal/execution";
import {
  mergeValidatedPlan,
  requestPlan,
  requestRefinement,
} from "@/features/pacepal/planning/client";
import { buildSchedule } from "@/features/pacepal/scheduler";
import { chainTasksByOrder } from "@/features/pacepal/task-graph";
import {
  clearAppState,
  clearAppStateOwner,
  loadAppState,
  loadAppStateOwner,
  saveAppState,
  saveAppStateOwner,
} from "@/features/pacepal/storage";
import { createClient as createSupabaseClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";

type Screen = "dashboard" | "create" | "plan" | "account";
type DashboardView = "overview" | "tasks" | "schedule";
type TaskAdjustmentMode = "ai" | "manual" | null;
type SyncStatus = "local" | "loading" | "saving" | "synced" | "error";
type FormErrors = Partial<Record<keyof AssignmentInput, string>>;
type TaskSelection = { assignmentId: string; subtaskId: string };
type TodayPlanDraftItem = TaskSelection & {
  blockId: string;
  durationMinutes: number;
};

const emptyForm: AssignmentInput = {
  title: "",
  requirements: "",
  deliverable: "",
  deadline: "",
  priority: "medium",
};

const fieldClassName =
  "mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-base text-slate-950 shadow-[0_1px_2px_rgba(15,23,42,0.03)] outline-none transition focus:border-violet-500 focus:ring-4 focus:ring-violet-500/10";
const primaryButtonClassName =
  "inline-flex min-h-11 items-center justify-center rounded-xl bg-[#5b55df] px-5 py-2.5 font-semibold text-white shadow-[0_10px_24px_rgba(91,85,223,0.22)] transition hover:bg-[#4943c8] focus:outline-none focus:ring-4 focus:ring-violet-500/20 disabled:cursor-not-allowed disabled:opacity-50";
const secondaryButtonClassName =
  "inline-flex min-h-10 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2 font-semibold text-slate-700 shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-950 focus:outline-none focus:ring-4 focus:ring-blue-500/10";
const textButtonClassName =
  "rounded-lg px-2.5 py-1.5 text-sm font-semibold text-slate-500 transition hover:bg-slate-100 hover:text-slate-950 focus:outline-none focus:ring-4 focus:ring-blue-500/10";
const surfaceClassName =
  "rounded-2xl border border-slate-200/80 bg-white shadow-[0_12px_35px_rgba(39,39,76,0.06)]";

const statusLabels: Record<Subtask["status"], string> = {
  blocked: "卡住",
  completed: "已完成",
  in_progress: "进行中",
  paused: "已暂停",
  postponed: "已延期",
  todo: "待开始",
};

function createId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "short",
    day: "numeric",
    weekday: "short",
  }).format(new Date(value));
}

function formatScheduleDate(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "short",
    day: "numeric",
    weekday: "short",
  }).format(new Date(`${value}T12:00:00`));
}

function currentDateKey() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function dateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function tomorrowDateKey() {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  return dateKey(tomorrow);
}

function greetingText() {
  const hour = new Date().getHours();
  if (hour < 11) return "早上好";
  if (hour < 18) return "下午好";
  return "晚上好";
}

function addMinutesToTime(value: string, minutes: number) {
  const [hours, initialMinutes] = value.split(":").map(Number);
  const total = hours * 60 + initialMinutes + minutes;
  return `${String(Math.floor(total / 60) % 24).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

function formatElapsedTime(totalSeconds: number) {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const seconds = safeSeconds % 60;
  return [hours, minutes, seconds]
    .map((value) => String(value).padStart(2, "0"))
    .join(":");
}

function settleActiveTime(task: Subtask, now = new Date()): Subtask {
  if (!task.activeSince) return task;
  const elapsed = Math.max(
    0,
    Math.round((now.getTime() - new Date(task.activeSince).getTime()) / 60_000),
  );
  return {
    ...task,
    actualMinutes: task.actualMinutes + elapsed,
    activeSince: null,
  };
}

function rebuildAssignmentSchedule(
  assignment: Assignment,
  scheduleNotice: string,
  now = new Date(),
): Assignment {
  const result = buildSchedule(
    assignment.subtasks,
    assignment.deadline,
    assignment.availability,
    now,
    assignment.schedule,
  );

  return {
    ...assignment,
    schedule: result.blocks,
    scheduleNotice,
    unscheduledMinutes: result.unscheduledMinutes,
  };
}

function validateAssignment(form: AssignmentInput) {
  const errors: FormErrors = {};

  if (!form.title.trim()) errors.title = "请输入任务名称";
  if (!form.requirements.trim()) errors.requirements = "请输入任务要求";
  if (!form.deliverable.trim()) errors.deliverable = "请输入成果形式";

  if (!form.deadline) {
    errors.deadline = "请选择截止时间";
  } else if (new Date(form.deadline).getTime() <= Date.now()) {
    errors.deadline = "截止时间需要晚于现在";
  }

  return errors;
}

export function PacePalApp() {
  const cloudEnabled = isSupabaseConfigured();
  const [hydrated, setHydrated] = useState(false);
  const [appState, setAppState] = useState<AppState>(emptyAppState);
  const [screen, setScreen] = useState<Screen>("dashboard");
  const [accountReturnScreen, setAccountReturnScreen] =
    useState<Screen>("dashboard");
  const [dashboardView, setDashboardView] = useState<DashboardView>("overview");
  const [formMode, setFormMode] = useState<"create" | "edit">("create");
  const [form, setForm] = useState<AssignmentInput>(emptyForm);
  const [errors, setErrors] = useState<FormErrors>({});
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [planError, setPlanError] = useState("");
  const [planClarification, setPlanClarification] = useState("");
  const [planBusy, setPlanBusy] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [cloudReady, setCloudReady] = useState(false);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("local");
  const [authEmail, setAuthEmail] = useState("");
  const [authMessage, setAuthMessage] = useState("");
  const [authError, setAuthError] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [chatDraft, setChatDraft] = useState("");
  const [chatBusy, setChatBusy] = useState(false);
  const [taskAdjustmentMode, setTaskAdjustmentMode] =
    useState<TaskAdjustmentMode>("ai");
  const draggedTaskIdRef = useRef<string | null>(null);
  const [manualRecommendation, setManualRecommendation] =
    useState<TaskSelection | null>(null);
  const [recommendationPickerOpen, setRecommendationPickerOpen] =
    useState(false);
  const [clockTick, setClockTick] = useState(() => Date.now());
  const [todayPlanEditing, setTodayPlanEditing] = useState(false);
  const [todayPlanStartTime, setTodayPlanStartTime] = useState("09:00");
  const [todayPlanDraft, setTodayPlanDraft] = useState<TodayPlanDraftItem[]>(
    [],
  );
  const userId = user?.id ?? null;

  const hasRunningTask = appState.assignments.some((item) =>
    item.subtasks.some(
      (subtask) =>
        subtask.status === "in_progress" && Boolean(subtask.activeSince),
    ),
  );

  useEffect(() => {
    if (!hasRunningTask) return;
    const timer = window.setInterval(() => setClockTick(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [hasRunningTask]);

  useEffect(() => {
    let cancelled = false;

    async function initialize() {
      let storedState = loadAppState();
      const storedOwner = loadAppStateOwner();

      if (!cloudEnabled) {
        if (!cancelled) {
          setAppState(storedState);
          if (
            storedState.assignments.find(
              (item) => item.id === storedState.selectedAssignmentId,
            )?.status === "planning"
          )
            setScreen("plan");
          setHydrated(true);
        }
        return;
      }

      try {
        const client = createSupabaseClient();
        const { data, error } = await client.auth.getSession();
        if (error) throw error;
        const currentUser = data.session?.user ?? null;

        if (!currentUser) {
          if (storedOwner) {
            clearAppState();
            clearAppStateOwner();
            storedState = emptyAppState;
          }

          if (!cancelled) {
            setAppState(storedState);
            if (
              storedState.assignments.find(
                (item) => item.id === storedState.selectedAssignmentId,
              )?.status === "planning"
            ) {
              setScreen("plan");
            }
            setSyncStatus("local");
          }
        } else {
          const cloudState = await loadCloudState(client, currentUser.id);
          const canMigrateLocalState =
            !storedOwner || storedOwner === currentUser.id;
          const nextState =
            cloudState ?? (canMigrateLocalState ? storedState : emptyAppState);

          if (!cloudState) {
            await saveCloudState(client, currentUser.id, nextState);
          }

          saveAppState(nextState);
          saveAppStateOwner(currentUser.id);

          if (!cancelled) {
            setUser(currentUser);
            setAppState(nextState);
            setCloudReady(true);
            setSyncStatus("synced");
            if (
              nextState.assignments.find(
                (item) => item.id === nextState.selectedAssignmentId,
              )?.status === "planning"
            )
              setScreen("plan");
          }
        }
      } catch {
        if (!cancelled) {
          setAppState(storedOwner ? emptyAppState : storedState);
          setSyncStatus("error");
          setAuthError("暂时无法连接云端");
        }
      } finally {
        if (!cancelled) {
          if (new URLSearchParams(window.location.search).has("auth")) {
            setScreen("account");
            window.history.replaceState({}, "", window.location.pathname);
          }
          setHydrated(true);
        }
      }
    }

    void initialize();
    return () => {
      cancelled = true;
    };
  }, [cloudEnabled]);

  useEffect(() => {
    if (!hydrated) return;

    saveAppState(appState);
    if (!userId || !cloudReady) return;

    saveAppStateOwner(userId);

    const saveTimer = window.setTimeout(() => {
      setSyncStatus("saving");
      void saveCloudState(createSupabaseClient(), userId, appState)
        .then(() => setSyncStatus("synced"))
        .catch(() => setSyncStatus("error"));
    }, 500);

    return () => window.clearTimeout(saveTimer);
  }, [appState, cloudReady, hydrated, userId]);

  const assignments = appState.assignments;
  const assignment =
    assignments.find((item) => item.id === appState.selectedAssignmentId) ??
    assignments[0] ??
    null;
  const completedCount =
    assignment?.subtasks.filter((subtask) => subtask.status === "completed")
      .length ?? 0;
  const recommendation = useMemo(
    () =>
      recommendAcrossAssignments(
        assignments,
        assignment?.checkIn ?? { availableMinutes: 30, energy: "medium" },
      ),
    [assignment?.checkIn, assignments],
  );

  function updateAssignment(
    updater: (current: Assignment) => Assignment,
    assignmentId = assignment?.id,
  ) {
    setAppState((current) => {
      if (!assignmentId) return current;
      return {
        ...current,
        assignments: current.assignments.map((item) =>
          item.id === assignmentId ? updater(item) : item,
        ),
      };
    });
  }

  function selectAssignment(id: string, view: DashboardView = "overview") {
    setAppState((current) => ({ ...current, selectedAssignmentId: id }));
    setDashboardView(view);
    setScreen("dashboard");
  }

  function openAccount() {
    setAccountReturnScreen(screen);
    setAuthError("");
    setAuthMessage("");
    setScreen("account");
  }

  async function sendLoginLink(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!cloudEnabled || !authEmail.trim()) return;

    setAuthBusy(true);
    setAuthError("");
    setAuthMessage("");

    const { error } = await createSupabaseClient().auth.signInWithOtp({
      email: authEmail.trim(),
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
        shouldCreateUser: true,
      },
    });

    if (error) {
      setAuthError("登录邮件发送失败，请稍后重试");
    } else {
      setAuthMessage("登录邮件已发送");
    }
    setAuthBusy(false);
  }

  async function signOut() {
    setAuthBusy(true);
    setAuthError("");

    const { error } = await createSupabaseClient().auth.signOut();
    if (error) {
      setAuthError("退出失败，请稍后重试");
      setAuthBusy(false);
      return;
    }

    clearAppState();
    clearAppStateOwner();
    setAppState(emptyAppState);
    setUser(null);
    setCloudReady(false);
    setSyncStatus("local");
    setScreen("dashboard");
    setAuthBusy(false);
  }

  function openCreate() {
    setFormMode("create");
    setForm(emptyForm);
    setErrors({});
    setScreen("create");
  }

  function openEditAssignment() {
    if (!assignment) return;
    setFormMode("edit");
    setForm({
      title: assignment.title,
      requirements: assignment.requirements,
      deliverable: assignment.deliverable,
      deadline: assignment.deadline,
      priority: assignment.priority,
    });
    setErrors({});
    setScreen("create");
  }

  async function handleAssignmentSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextErrors = validateAssignment(form);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;
    setPlanError("");
    setPlanClarification("");

    if (formMode === "edit" && assignment) {
      const planningFieldsChanged =
        form.title !== assignment.title ||
        form.requirements !== assignment.requirements ||
        form.deliverable !== assignment.deliverable;
      const candidate = { ...assignment, ...form };
      setPlanBusy(true);

      if (planningFieldsChanged) {
        try {
          const response = await requestRefinement(
            candidate,
            "任务名称、要求或成果形式已经修改。请重新理解目标，只调整尚未完成的任务，保留已完成工作，并重新安排后续计划。",
          );
          updateAssignment((current) => {
            const edited = { ...current, ...form };
            const refined = response.changed
              ? mergeValidatedPlan(edited, response)
              : edited;
            return rebuildAssignmentSchedule(
              refined,
              response.changed
                ? "任务信息与后续任务已更新"
                : "任务信息已更新，安排已重算",
            );
          });
        } catch {
          updateAssignment((current) =>
            rebuildAssignmentSchedule(
              { ...current, ...form },
              "任务信息已更新；当前 AI 模型不可用，原任务已保留",
            ),
          );
        }
      } else {
        updateAssignment((current) =>
          rebuildAssignmentSchedule(
            { ...current, ...form },
            "截止时间或优先级已更新，安排已重算",
          ),
        );
      }

      setPlanBusy(false);
      setScreen(assignment.status === "scheduled" ? "dashboard" : "plan");
      return;
    }

    setPlanBusy(true);
    let plan: Awaited<ReturnType<typeof requestPlan>>;
    try {
      plan = await requestPlan(form);
    } catch (error) {
      setPlanError(
        error instanceof Error ? error.message : "暂时无法生成计划，请稍后重试",
      );
      setPlanBusy(false);
      return;
    }
    setPlanBusy(false);

    if (plan.needsClarification) {
      setPlanClarification(plan.assistantMessage);
      return;
    }

    const nextAssignment: Assignment = {
      ...form,
      id: createId("assignment"),
      createdAt: new Date().toISOString(),
      status: "planning",
      subtasks: plan.subtasks,
      availability: { dailyMinutes: 240, preferredTime: "09:00" },
      schedule: [],
      unscheduledMinutes: 0,
      checkIn: { availableMinutes: 30, energy: "medium" },
      scheduleNotice: "",
      chatMessages: [],
      language: plan.language,
      planVersion: plan.planVersion,
      planHistory: plan.planHistory,
      planningSummary: plan.assistantMessage,
      planningAssumptions: plan.assumptions,
    };

    setAppState((current) => ({
      ...current,
      assignments: [...current.assignments, nextAssignment],
      selectedAssignmentId: nextAssignment.id,
      version: 2,
    }));
    setEditingTaskId(null);
    setScreen("plan");
  }

  function updateSubtask(id: string, patch: Partial<Subtask>) {
    updateAssignment((current) => ({
      ...current,
      subtasks: current.subtasks.map((subtask) =>
        subtask.id === id ? { ...subtask, ...patch } : subtask,
      ),
    }));
  }

  function moveSubtask(id: string, direction: -1 | 1) {
    updateAssignment((current) => {
      const index = current.subtasks.findIndex((subtask) => subtask.id === id);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= current.subtasks.length) {
        return current;
      }

      const reordered = [...current.subtasks];
      [reordered[index], reordered[target]] = [
        reordered[target],
        reordered[index],
      ];
      return { ...current, subtasks: chainTasksByOrder(reordered) };
    });
  }

  function deleteSubtask(id: string) {
    updateAssignment((current) => ({
      ...current,
      subtasks: chainTasksByOrder(
        current.subtasks.filter((subtask) => subtask.id !== id),
      ),
    }));
    setEditingTaskId((current) => (current === id ? null : current));
  }

  function addSubtask() {
    const id = createId("task");
    updateAssignment((current) => ({
      ...current,
      subtasks: chainTasksByOrder([
        ...current.subtasks,
        {
          actualMinutes: 0,
          activeSince: null,
          id,
          title: "新任务",
          description: "写下完成这一步需要做什么。",
          estimatedMinutes: 30,
          completionCriteria: "写下明确的完成标准",
          difficulty: "medium",
          dependencies: [],
          status: "todo",
          postponedUntil: null,
        },
      ]),
    }));
    setEditingTaskId(id);
  }

  function applyManualSubtasks(
    current: Assignment,
    subtasks: Subtask[],
    normalizeOrder = true,
  ): Assignment {
    const adjusted = {
      ...current,
      subtasks: normalizeOrder ? chainTasksByOrder(subtasks) : subtasks,
    };
    return current.status === "scheduled"
      ? rebuildAssignmentSchedule(adjusted, "")
      : adjusted;
  }

  function updateManualSubtask(id: string, patch: Partial<Subtask>) {
    updateAssignment((current) =>
      applyManualSubtasks(
        current,
        current.subtasks.map((subtask) =>
          subtask.id === id ? { ...subtask, ...patch } : subtask,
        ),
        false,
      ),
    );
  }

  function addManualSubtask() {
    const id = createId("task");
    updateAssignment((current) =>
      applyManualSubtasks(current, [
        ...current.subtasks,
        {
          actualMinutes: 0,
          activeSince: null,
          completionCriteria: "完成这一步的目标",
          dependencies: [],
          description: "写下完成这一步需要做什么",
          difficulty: "medium",
          estimatedMinutes: 30,
          id,
          postponedUntil: null,
          status: "todo",
          title: "新子任务",
        },
      ]),
    );
  }

  function deleteManualSubtask(id: string) {
    if (!assignment || assignment.subtasks.length <= 1) return;
    if (!window.confirm("删除这个子任务？")) return;
    updateAssignment((current) =>
      applyManualSubtasks(
        current,
        current.subtasks.filter((subtask) => subtask.id !== id),
      ),
    );
  }

  function reorderManualSubtasks(sourceId: string, targetId: string) {
    if (sourceId === targetId) return;
    updateAssignment((current) => {
      const sourceIndex = current.subtasks.findIndex(
        (subtask) => subtask.id === sourceId,
      );
      const targetIndex = current.subtasks.findIndex(
        (subtask) => subtask.id === targetId,
      );
      if (sourceIndex < 0 || targetIndex < 0) return current;

      const reordered = [...current.subtasks];
      const [moved] = reordered.splice(sourceIndex, 1);
      reordered.splice(targetIndex, 0, moved);
      return applyManualSubtasks(current, reordered);
    });
  }

  function approvePlan() {
    if (!assignment || assignment.subtasks.length === 0) {
      setPlanError("至少保留一个任务");
      return;
    }

    const invalidTask = assignment.subtasks.some(
      (subtask) =>
        !subtask.title.trim() ||
        !subtask.description.trim() ||
        !subtask.completionCriteria.trim() ||
        subtask.estimatedMinutes < 5,
    );

    if (invalidTask) {
      setPlanError("请补全任务信息");
      return;
    }

    setPlanError("");
    setEditingTaskId(null);
    const result = buildSchedule(
      assignment.subtasks,
      assignment.deadline,
      assignment.availability,
    );

    updateAssignment((current) => ({
      ...current,
      status: "scheduled",
      schedule: result.blocks,
      scheduleNotice: "",
      unscheduledMinutes: result.unscheduledMinutes,
    }));
    setDashboardView("overview");
    setScreen("dashboard");
  }

  function toggleCompleted(id: string, assignmentId = assignment?.id) {
    updateAssignment((current) => {
      const now = new Date();
      const subtasks = current.subtasks.map((subtask) => {
        if (subtask.id !== id) return subtask;
        if (subtask.status === "completed") {
          return { ...subtask, status: "todo" as const };
        }
        return {
          ...settleActiveTime(subtask, now),
          postponedUntil: null,
          status: "completed" as const,
        };
      });
      return rebuildAssignmentSchedule(
        { ...current, subtasks },
        "完成状态已更新，后续安排已重排",
        now,
      );
    }, assignmentId);
  }

  function startTask(id: string, assignmentId = assignment?.id) {
    if (!assignmentId) return;
    const now = new Date();
    setClockTick(now.getTime());
    setAppState((current) => ({
      ...current,
      assignments: current.assignments.map((item) => ({
        ...item,
        subtasks: item.subtasks.map((subtask) => {
          if (item.id === assignmentId && subtask.id === id) {
            return {
              ...subtask,
              activeSince: now.toISOString(),
              postponedUntil: null,
              status: "in_progress",
            };
          }
          return subtask.status === "in_progress"
            ? { ...settleActiveTime(subtask, now), status: "paused" }
            : subtask;
        }),
      })),
    }));
  }

  function pauseTask(id: string, assignmentId = assignment?.id) {
    const now = new Date();
    updateAssignment(
      (current) => ({
        ...current,
        subtasks: current.subtasks.map((subtask) =>
          subtask.id === id
            ? { ...settleActiveTime(subtask, now), status: "paused" }
            : subtask,
        ),
      }),
      assignmentId,
    );
  }

  function postponeTask(id: string, assignmentId = assignment?.id) {
    const now = new Date();
    updateAssignment((current) => {
      const subtasks = current.subtasks.map((subtask) =>
        subtask.id === id
          ? {
              ...settleActiveTime(subtask, now),
              postponedUntil: tomorrowDateKey(),
              status: "postponed" as const,
            }
          : subtask,
      );
      return rebuildAssignmentSchedule(
        { ...current, subtasks },
        "任务已延至明天，后续安排已重排",
        now,
      );
    }, assignmentId);
  }

  function blockTask(id: string, assignmentId = assignment?.id) {
    const now = new Date();
    updateAssignment((current) => {
      const subtasks = current.subtasks.map((subtask) =>
        subtask.id === id
          ? {
              ...settleActiveTime(subtask, now),
              status: "blocked" as const,
            }
          : subtask,
      );
      return rebuildAssignmentSchedule(
        { ...current, subtasks },
        "已标记卡住，相关任务暂未安排",
        now,
      );
    }, assignmentId);
  }

  function splitBlockedTask(id: string, assignmentId = assignment?.id) {
    const now = new Date();
    updateAssignment((current) => {
      const targetIndex = current.subtasks.findIndex((task) => task.id === id);
      if (targetIndex < 0) return current;
      const target = current.subtasks[targetIndex];
      const smallTaskId = createId("step");
      const smallerTask: Subtask = {
        actualMinutes: 0,
        activeSince: null,
        completionCriteria: "留下一个可以继续推进的结果",
        dependencies: target.dependencies,
        description: `先为“${target.title}”完成一个最小可行动步骤。`,
        difficulty: "low",
        estimatedMinutes: 15,
        id: smallTaskId,
        postponedUntil: null,
        status: "todo",
        title: `${target.title}：先做一步`,
      };
      const subtasks = [...current.subtasks];
      subtasks.splice(targetIndex, 1, smallerTask, {
        ...target,
        dependencies: [smallTaskId],
        status: "paused",
      });
      return rebuildAssignmentSchedule(
        { ...current, subtasks },
        "已拆出一个 15 分钟的小步骤",
        now,
      );
    }, assignmentId);
  }

  function updateCheckIn(patch: Partial<Assignment["checkIn"]>) {
    setAppState((current) => ({
      ...current,
      assignments: current.assignments.map((item) => ({
        ...item,
        checkIn: { ...item.checkIn, ...patch },
      })),
    }));
    setManualRecommendation(null);
  }

  function openTodayPlanEditor() {
    setTodayPlanStartTime(todayBlocks[0]?.block.startTime ?? "09:00");
    setTodayPlanDraft(
      todayBlocks.map(({ assignment: item, block }) => ({
        assignmentId: item.id,
        blockId: block.id,
        durationMinutes: block.durationMinutes,
        subtaskId: block.subtaskId,
      })),
    );
    setTodayPlanEditing(true);
  }

  function addTodayPlanTask(value: string) {
    const [assignmentId, subtaskId] = value.split("::");
    if (!assignmentId || !subtaskId) return;
    const targetAssignment = assignments.find(
      (item) => item.id === assignmentId,
    );
    const targetTask = targetAssignment?.subtasks.find(
      (subtask) => subtask.id === subtaskId,
    );
    if (!targetTask) return;
    setTodayPlanDraft((current) =>
      current.some(
        (item) =>
          item.assignmentId === assignmentId && item.subtaskId === subtaskId,
      )
        ? current
        : [
            ...current,
            {
              assignmentId,
              blockId: createId("block"),
              durationMinutes: Math.min(targetTask.estimatedMinutes, 60),
              subtaskId,
            },
          ],
    );
  }

  function moveTodayPlanItem(index: number, direction: -1 | 1) {
    setTodayPlanDraft((current) => {
      const target = index + direction;
      if (target < 0 || target >= current.length) return current;
      const reordered = [...current];
      [reordered[index], reordered[target]] = [
        reordered[target],
        reordered[index],
      ];
      return reordered;
    });
  }

  function saveTodayPlan() {
    if (!/^\d{2}:\d{2}$/.test(todayPlanStartTime)) return;
    const today = currentDateKey();
    let elapsedMinutes = 0;
    const normalized = todayPlanDraft.map((item) => {
      const block = {
        ...item,
        date: today,
        durationMinutes: Math.max(5, item.durationMinutes),
        locked: true,
        startTime: addMinutesToTime(todayPlanStartTime, elapsedMinutes),
      };
      elapsedMinutes += block.durationMinutes;
      return block;
    });

    setAppState((current) => ({
      ...current,
      assignments: current.assignments.map((item) => ({
        ...item,
        schedule: [
          ...item.schedule.filter((block) => block.date !== today),
          ...normalized
            .filter((block) => block.assignmentId === item.id)
            .map((block) => ({
              date: block.date,
              durationMinutes: block.durationMinutes,
              id: block.blockId,
              locked: block.locked,
              startTime: block.startTime,
              subtaskId: block.subtaskId,
            })),
        ].sort(
          (left, right) =>
            left.date.localeCompare(right.date) ||
            left.startTime.localeCompare(right.startTime),
        ),
        scheduleNotice: "",
      })),
    }));
    setTodayPlanEditing(false);
  }

  async function sendChatMessage(content: string) {
    const message = content.trim();
    if (!assignment || !message || chatBusy) return;

    const userMessage: ChatMessage = {
      content: message,
      createdAt: new Date().toISOString(),
      id: createId("message"),
      role: "user",
    };
    setChatDraft("");
    setChatBusy(true);
    updateAssignment((current) => ({
      ...current,
      chatMessages: [...current.chatMessages, userMessage],
    }));

    try {
      const response = await requestRefinement(
        {
          ...assignment,
          chatMessages: [...assignment.chatMessages, userMessage],
        },
        message,
      );
      const assistantMessage: ChatMessage = {
        content: response.assistantMessage,
        createdAt: new Date().toISOString(),
        id: createId("message"),
        role: "assistant",
      };

      updateAssignment((current) => {
        const refined = response.changed
          ? mergeValidatedPlan(current, response)
          : current;
        const changedTaskPlan = response.appliedOperations.some(
          (operation) => operation.type !== "reschedule",
        );
        const next = response.changed
          ? rebuildAssignmentSchedule(
              refined,
              changedTaskPlan ? "AI 调整已应用" : "后续日程已重新计算",
            )
          : refined;
        return {
          ...next,
          chatMessages: [...next.chatMessages, assistantMessage],
        };
      });
    } catch (error) {
      const failureMessage =
        error instanceof Error
          ? error.message
          : "当前 AI 模型不可用，请稍后重试。";
      updateAssignment((current) => ({
        ...current,
        chatMessages: [
          ...current.chatMessages,
          {
            content: `${failureMessage} 你的计划没有变化。`,
            createdAt: new Date().toISOString(),
            id: createId("message"),
            role: "assistant",
          },
        ],
      }));
    } finally {
      setChatBusy(false);
    }
  }

  function submitChat(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void sendChatMessage(chatDraft);
  }

  function deleteAssignment() {
    if (!window.confirm("删除当前任务计划？")) return;
    if (!assignment) return;
    setAppState((current) => {
      const assignments = current.assignments.filter(
        (item) => item.id !== assignment.id,
      );
      return {
        ...current,
        assignments,
        selectedAssignmentId: assignments[0]?.id ?? null,
      };
    });
    setScreen("dashboard");
    setDashboardView("tasks");
  }

  const appFrameProps = {
    accountLabel: user ? "账户" : cloudEnabled ? "登录" : "本机保存",
    onAccount: openAccount,
  };
  const syncStatusText: Record<SyncStatus, string> = {
    error: "同步失败",
    loading: "正在加载",
    local: "本机保存",
    saving: "正在同步",
    synced: "云端已同步",
  };

  if (!hydrated) {
    return (
      <main className="grid min-h-dvh place-items-center px-6">
        <h1 className="text-4xl font-semibold tracking-tight text-slate-950">
          PacePal
        </h1>
      </main>
    );
  }

  if (screen === "account") {
    return (
      <AppFrame {...appFrameProps}>
        <div className="mx-auto w-full max-w-md py-10 sm:py-16">
          <button
            className={textButtonClassName}
            onClick={() =>
              setScreen(
                accountReturnScreen === "account"
                  ? "dashboard"
                  : accountReturnScreen,
              )
            }
            type="button"
          >
            返回
          </button>

          {!cloudEnabled ? (
            <div className="mt-6">
              <h1 className="text-3xl font-semibold tracking-[-0.03em] text-slate-950">
                本机保存
              </h1>
              <p className="mt-6 text-slate-600">云端服务尚未配置。</p>
            </div>
          ) : user ? (
            <div className="mt-6">
              <h1 className="text-3xl font-semibold tracking-[-0.03em] text-slate-950">
                账户
              </h1>
              <dl className="mt-8 divide-y divide-slate-200 border-y border-slate-200">
                <div className="flex items-center justify-between gap-4 py-4">
                  <dt className="text-slate-500">邮箱</dt>
                  <dd className="min-w-0 truncate font-medium text-slate-950">
                    {user.email}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-4 py-4">
                  <dt className="text-slate-500">数据</dt>
                  <dd className="font-medium text-slate-950">
                    {syncStatusText[syncStatus]}
                  </dd>
                </div>
              </dl>
              {authError ? (
                <p
                  className="mt-4 text-sm font-medium text-red-700"
                  role="alert"
                >
                  {authError}
                </p>
              ) : null}
              <button
                className={`${secondaryButtonClassName} mt-8 w-full`}
                disabled={authBusy}
                onClick={() => void signOut()}
                type="button"
              >
                退出登录
              </button>
            </div>
          ) : (
            <div className="mt-6">
              <h1 className="text-3xl font-semibold tracking-[-0.03em] text-slate-950">
                登录
              </h1>
              <form
                className={`${surfaceClassName} mt-8 space-y-6 p-5 sm:p-7`}
                onSubmit={sendLoginLink}
              >
                <FormField label="邮箱">
                  <input
                    autoComplete="email"
                    className={fieldClassName}
                    id="auth-email"
                    onChange={(event) => setAuthEmail(event.target.value)}
                    required
                    type="email"
                    value={authEmail}
                  />
                </FormField>
                {authError ? (
                  <p className="text-sm font-medium text-red-700" role="alert">
                    {authError}
                  </p>
                ) : null}
                {authMessage ? (
                  <p className="font-medium text-emerald-700" role="status">
                    {authMessage}
                  </p>
                ) : null}
                <button
                  className={`${primaryButtonClassName} w-full`}
                  disabled={authBusy}
                  type="submit"
                >
                  {authBusy ? "发送中" : "发送登录链接"}
                </button>
              </form>
            </div>
          )}
        </div>
      </AppFrame>
    );
  }

  if (screen === "create") {
    return (
      <AppFrame {...appFrameProps}>
        <div className="mx-auto w-full max-w-2xl py-10 sm:py-16">
          <button
            className={textButtonClassName}
            onClick={() =>
              setScreen(
                formMode === "edit" && assignment?.status === "planning"
                  ? "plan"
                  : "dashboard",
              )
            }
            type="button"
          >
            返回
          </button>
          <h1 className="mt-6 text-3xl font-semibold tracking-[-0.03em] text-slate-950">
            {formMode === "create" ? "创建任务" : "编辑任务"}
          </h1>

          <form
            className={`${surfaceClassName} mt-8 space-y-6 p-5 sm:p-8`}
            onSubmit={handleAssignmentSubmit}
          >
            <FormField label="任务名称" error={errors.title}>
              <input
                className={fieldClassName}
                id="title"
                value={form.title}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    title: event.target.value,
                  }))
                }
              />
            </FormField>

            <FormField label="任务要求" error={errors.requirements}>
              <textarea
                className={`${fieldClassName} min-h-32 resize-y`}
                id="requirements"
                value={form.requirements}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    requirements: event.target.value,
                  }))
                }
              />
            </FormField>

            <FormField label="成果形式" error={errors.deliverable}>
              <input
                className={fieldClassName}
                id="deliverable"
                placeholder="例如：2500 字课程论文"
                value={form.deliverable}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    deliverable: event.target.value,
                  }))
                }
              />
            </FormField>

            <div className="grid gap-6 sm:grid-cols-2">
              <FormField label="截止时间" error={errors.deadline}>
                <input
                  className={fieldClassName}
                  id="deadline"
                  type="datetime-local"
                  value={form.deadline}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      deadline: event.target.value,
                    }))
                  }
                />
              </FormField>

              <FormField label="优先级">
                <select
                  className={fieldClassName}
                  id="priority"
                  value={form.priority}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      priority: event.target
                        .value as AssignmentInput["priority"],
                    }))
                  }
                >
                  <option value="low">低</option>
                  <option value="medium">中</option>
                  <option value="high">高</option>
                </select>
              </FormField>
            </div>

            {planError ? (
              <p className="text-sm font-medium text-red-700" role="alert">
                {planError}
              </p>
            ) : null}
            {planClarification ? (
              <p
                className="rounded-xl bg-amber-50 px-4 py-3 text-sm font-medium text-amber-900"
                role="status"
              >
                {planClarification}
              </p>
            ) : null}

            <div className="flex justify-end pt-2">
              <button
                className={primaryButtonClassName}
                disabled={planBusy}
                type="submit"
              >
                {planBusy
                  ? formMode === "create"
                    ? "正在生成"
                    : "正在更新"
                  : formMode === "create"
                    ? "保存并生成任务"
                    : "保存"}
              </button>
            </div>
          </form>
        </div>
      </AppFrame>
    );
  }

  if (screen === "plan" && assignment) {
    return (
      <AppFrame {...appFrameProps}>
        <div className="mx-auto w-full max-w-3xl py-10 sm:py-16">
          <button
            className={textButtonClassName}
            onClick={openEditAssignment}
            type="button"
          >
            编辑任务
          </button>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h1 className="text-3xl font-semibold tracking-[-0.03em] text-slate-950">
                确认任务计划
              </h1>
              <p className="mt-2 text-slate-600">
                {assignment.title} · {formatDate(assignment.deadline)}
              </p>
            </div>
            <button
              className={secondaryButtonClassName}
              onClick={addSubtask}
              type="button"
            >
              添加任务
            </button>
          </div>

          {assignment.planningSummary ? (
            <section
              className={`${surfaceClassName} mt-8 px-5 py-5 sm:px-6`}
              aria-label="AI 对任务的理解"
            >
              <h2 className="font-semibold text-slate-950">任务理解</h2>
              <p className="mt-2 leading-7 text-slate-600">
                {assignment.planningSummary}
              </p>
              {assignment.planningAssumptions?.length ? (
                <ul className="mt-3 space-y-1 text-sm text-slate-500">
                  {assignment.planningAssumptions.map((assumption) => (
                    <li key={assumption}>假设：{assumption}</li>
                  ))}
                </ul>
              ) : null}
            </section>
          ) : null}

          <ol
            className={`${surfaceClassName} mt-6 divide-y divide-slate-100 overflow-hidden px-5 sm:px-6`}
          >
            {assignment.subtasks.map((subtask, index) => (
              <li className="py-5" key={subtask.id}>
                {subtask.phase &&
                (index === 0 ||
                  assignment.subtasks[index - 1]?.phase !== subtask.phase) ? (
                  <p className="mb-3 text-xs font-semibold tracking-[0.08em] text-violet-600 uppercase">
                    {subtask.phase}
                  </p>
                ) : null}
                {editingTaskId === subtask.id ? (
                  <SubtaskEditor
                    subtask={subtask}
                    onChange={(patch) => updateSubtask(subtask.id, patch)}
                    onDone={() => setEditingTaskId(null)}
                  />
                ) : (
                  <div className="flex gap-4">
                    <span className="pt-0.5 text-sm font-medium text-slate-400">
                      {index + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <h2 className="font-semibold text-slate-950">
                            {subtask.title}
                          </h2>
                          <p className="mt-1 text-slate-600">
                            {subtask.completionCriteria}
                          </p>
                        </div>
                        <span className="shrink-0 text-sm text-slate-500">
                          {subtask.estimatedMinutes} 分钟
                        </span>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-1">
                        <button
                          aria-label={`上移 ${subtask.title}`}
                          className={textButtonClassName}
                          disabled={index === 0}
                          onClick={() => moveSubtask(subtask.id, -1)}
                          type="button"
                        >
                          上移
                        </button>
                        <button
                          aria-label={`下移 ${subtask.title}`}
                          className={textButtonClassName}
                          disabled={index === assignment.subtasks.length - 1}
                          onClick={() => moveSubtask(subtask.id, 1)}
                          type="button"
                        >
                          下移
                        </button>
                        <button
                          aria-label={`编辑 ${subtask.title}`}
                          className={textButtonClassName}
                          onClick={() => setEditingTaskId(subtask.id)}
                          type="button"
                        >
                          编辑
                        </button>
                        <button
                          aria-label={`删除 ${subtask.title}`}
                          className={textButtonClassName}
                          onClick={() => deleteSubtask(subtask.id)}
                          type="button"
                        >
                          删除
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ol>

          {planError ? (
            <p className="mt-4 text-sm font-medium text-red-700" role="alert">
              {planError}
            </p>
          ) : null}

          <div className="mt-8 flex justify-end">
            <button className={primaryButtonClassName} onClick={approvePlan}>
              确认任务计划
            </button>
          </div>
        </div>
      </AppFrame>
    );
  }

  if (!assignment) {
    return (
      <WorkspaceFrame
        accountLabel={appFrameProps.accountLabel}
        activeView="overview"
        onAccount={openAccount}
        onNavigate={openCreate}
        syncLabel={syncStatusText[syncStatus]}
      >
        <div className="mx-auto w-full max-w-[1180px] px-5 py-7 sm:px-8 lg:px-10 lg:py-10">
          <div className="pb-7">
            <p className="mb-2 text-sm font-semibold text-violet-600">
              {greetingText()}
            </p>
            <h1 className="text-3xl font-semibold tracking-[-0.04em] text-slate-950 sm:text-[2.5rem]">
              开始新的任务计划
            </h1>
          </div>

          <section className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="rounded-2xl bg-[#5b55df] p-5 text-white shadow-[0_16px_36px_rgba(91,85,223,0.22)]">
                <p className="text-sm font-semibold text-violet-100">进行中</p>
                <p className="mt-3 text-4xl font-semibold tracking-[-0.05em]">
                  0
                </p>
              </div>
              <div className={`${surfaceClassName} p-5`}>
                <p className="text-sm font-semibold text-slate-500">今日安排</p>
                <p className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-slate-950">
                  0
                </p>
              </div>
              <div className={`${surfaceClassName} p-5`}>
                <p className="text-sm font-semibold text-slate-500">已完成</p>
                <p className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-slate-950">
                  0
                </p>
              </div>
            </div>

            <div className="grid gap-5 lg:grid-cols-[1.35fr_0.65fr]">
              <div
                className={`${surfaceClassName} flex min-h-80 flex-col justify-between overflow-hidden p-6 sm:p-8`}
              >
                <div className="flex size-12 items-center justify-center rounded-2xl bg-violet-100 text-violet-700">
                  <svg
                    aria-hidden="true"
                    className="size-6"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <path
                      d="M12 5v14M5 12h14"
                      stroke="currentColor"
                      strokeLinecap="round"
                      strokeWidth="2"
                    />
                  </svg>
                </div>
                <div>
                  <h2 className="text-2xl font-semibold tracking-[-0.03em] text-slate-950 sm:text-3xl">
                    创建第一个任务
                  </h2>
                  <div className="mt-6 flex flex-wrap gap-2">
                    {["任务拆解", "每日安排", "动态调整"].map((label) => (
                      <span
                        className="rounded-full bg-slate-100 px-3 py-1.5 text-sm font-semibold text-slate-600"
                        key={label}
                      >
                        {label}
                      </span>
                    ))}
                  </div>
                  <button
                    className={`${primaryButtonClassName} mt-8`}
                    onClick={openCreate}
                    type="button"
                  >
                    创建任务
                  </button>
                </div>
              </div>

              <div className="flex min-h-80 flex-col justify-between rounded-2xl bg-slate-950 p-6 text-white shadow-[0_18px_45px_rgba(15,23,42,0.16)] sm:p-8">
                <div className="flex size-11 items-center justify-center rounded-xl bg-violet-500 text-lg font-bold">
                  AI
                </div>
                <div>
                  <h2 className="text-2xl font-semibold tracking-[-0.03em]">
                    AI 任务规划
                  </h2>
                  <button
                    className="mt-7 inline-flex min-h-11 items-center justify-center rounded-xl bg-white px-5 py-2.5 font-semibold text-slate-950 transition hover:bg-violet-50 focus:ring-4 focus:ring-violet-400/30 focus:outline-none"
                    onClick={openCreate}
                    type="button"
                  >
                    开始规划
                  </button>
                </div>
              </div>
            </div>
          </section>
        </div>
      </WorkspaceFrame>
    );
  }

  const manualRecommendedAssignment = manualRecommendation
    ? assignments.find((item) => item.id === manualRecommendation.assignmentId)
    : null;
  const manualRecommendedTask = manualRecommendedAssignment?.subtasks.find(
    (task) =>
      task.id === manualRecommendation?.subtaskId &&
      task.status !== "completed",
  );
  const recommendedTask = manualRecommendedTask ?? recommendation?.task ?? null;
  const recommendedAssignment =
    (manualRecommendedTask ? manualRecommendedAssignment : null) ??
    recommendation?.assignment ??
    assignment;
  const recommendationReasons = manualRecommendedTask
    ? ["手动选择", "按你的决定开始"]
    : (recommendation?.reasons ?? []);
  const recommendedMinutes = recommendedTask
    ? Math.min(
        recommendedTask.estimatedMinutes,
        assignment.checkIn.availableMinutes,
      )
    : 0;
  const recommendedBlock = recommendedTask
    ? (recommendedAssignment.schedule.find(
        (block) =>
          block.subtaskId === recommendedTask.id &&
          block.date >= currentDateKey(),
      ) ?? null)
    : null;
  const remainingMinutes = assignment.subtasks
    .filter((task) => task.status !== "completed")
    .reduce((total, task) => total + task.estimatedMinutes, 0);
  const globalSchedule = assignments
    .flatMap((item) =>
      item.schedule.map((block) => ({ assignment: item, block })),
    )
    .sort(
      (left, right) =>
        left.block.date.localeCompare(right.block.date) ||
        left.block.startTime.localeCompare(right.block.startTime),
    );
  const todayBlocks = globalSchedule.filter(
    ({ block }) => block.date === currentDateKey(),
  );
  const allSubtasks = assignments.flatMap((item) => item.subtasks);
  const allRemainingMinutes = allSubtasks
    .filter((task) => task.status !== "completed")
    .reduce((total, task) => total + task.estimatedMinutes, 0);
  const pendingAssignments = assignments.filter((item) =>
    item.subtasks.some((task) => task.status !== "completed"),
  );
  const pendingTaskOptions = assignments.flatMap((item) =>
    item.subtasks
      .filter(
        (task) => task.status !== "completed" && task.status !== "blocked",
      )
      .map((task) => ({ assignment: item, task })),
  );
  const recommendedElapsedSeconds = recommendedTask
    ? recommendedTask.actualMinutes * 60 +
      (recommendedTask.activeSince
        ? Math.max(
            0,
            Math.floor(
              (clockTick - new Date(recommendedTask.activeSince).getTime()) /
                1_000,
            ),
          )
        : 0)
    : 0;
  const todayScheduledSeconds = todayBlocks.reduce(
    (total, { block }) => total + block.durationMinutes * 60,
    0,
  );
  const todayWorkedSeconds = todayBlocks.reduce(
    (total, { assignment: item, block }) => {
      const task = item.subtasks.find(
        (subtask) => subtask.id === block.subtaskId,
      );
      if (!task) return total;
      if (task.status === "completed") {
        return total + block.durationMinutes * 60;
      }
      const liveSeconds = task.activeSince
        ? Math.max(
            0,
            Math.floor(
              (clockTick - new Date(task.activeSince).getTime()) / 1_000,
            ),
          )
        : 0;
      return (
        total +
        Math.min(
          block.durationMinutes * 60,
          task.actualMinutes * 60 + liveSeconds,
        )
      );
    },
    0,
  );
  const todayProgress = todayScheduledSeconds
    ? Math.min(
        100,
        Math.round((todayWorkedSeconds / todayScheduledSeconds) * 100),
      )
    : 0;
  const viewTitles: Record<DashboardView, string> = {
    overview: "今日重点",
    schedule: "日历",
    tasks: "任务",
  };

  return (
    <WorkspaceFrame
      accountLabel={appFrameProps.accountLabel}
      activeView={dashboardView}
      onAccount={openAccount}
      onNavigate={setDashboardView}
      syncLabel={syncStatusText[syncStatus]}
    >
      <div
        className={`mx-auto w-full px-5 py-7 sm:px-8 lg:px-10 lg:py-10 ${
          dashboardView === "schedule" ? "max-w-[1500px]" : "max-w-[1180px]"
        }`}
      >
        <div className="flex flex-col gap-5 pb-7 sm:flex-row sm:items-end sm:justify-between">
          <div>
            {dashboardView === "overview" ? (
              <p className="mb-2 text-sm font-semibold text-violet-600">
                {greetingText()}
              </p>
            ) : null}
            <h1 className="text-3xl font-semibold tracking-[-0.04em] text-slate-950 sm:text-[2.5rem]">
              {viewTitles[dashboardView]}
            </h1>
          </div>
          <div className="flex gap-2">
            {dashboardView === "tasks" ? (
              <>
                <button
                  className={textButtonClassName}
                  onClick={openEditAssignment}
                  type="button"
                >
                  编辑任务
                </button>
                <button
                  className={textButtonClassName}
                  onClick={deleteAssignment}
                  type="button"
                >
                  删除任务
                </button>
              </>
            ) : null}
            {dashboardView === "overview" ? (
              <button
                className={primaryButtonClassName}
                onClick={openCreate}
                type="button"
              >
                新建任务
              </button>
            ) : null}
          </div>
        </div>

        {dashboardView === "overview" ? (
          <section className="space-y-5">
            <section className={`${surfaceClassName} overflow-hidden`}>
              <div className="flex items-center justify-between gap-4 border-b border-slate-100 px-5 py-4 sm:px-6">
                <h2 className="text-lg font-semibold text-slate-950">
                  待完成任务
                </h2>
                <span className="text-sm font-semibold text-slate-500">
                  {allRemainingMinutes} 分钟
                </span>
              </div>
              <div className="divide-y divide-slate-100">
                {pendingAssignments.map((item) => {
                  const done = item.subtasks.filter(
                    (task) => task.status === "completed",
                  ).length;
                  const progress = item.subtasks.length
                    ? Math.round((done / item.subtasks.length) * 100)
                    : 0;
                  const priorityLabel =
                    item.priority === "high"
                      ? "高优先级"
                      : item.priority === "low"
                        ? "低优先级"
                        : "中优先级";
                  return (
                    <button
                      className="grid w-full gap-4 px-5 py-5 text-left transition hover:bg-slate-50 focus:bg-violet-50 focus:outline-none sm:grid-cols-[minmax(0,1fr)_auto_15rem] sm:items-center sm:px-6"
                      key={item.id}
                      onClick={() => selectAssignment(item.id, "tasks")}
                      type="button"
                    >
                      <span className="min-w-0">
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="truncate text-base font-semibold text-slate-950">
                            {item.title}
                          </span>
                          <span className="rounded-full bg-violet-50 px-2.5 py-1 text-xs font-semibold text-violet-700">
                            {priorityLabel}
                          </span>
                        </span>
                        <span className="mt-1.5 block truncate text-sm font-medium text-slate-500">
                          {item.deliverable}
                        </span>
                      </span>
                      <span className="text-sm font-semibold text-slate-500">
                        截止 {formatDate(item.deadline)}
                      </span>
                      <span className="flex items-center gap-3">
                        <span className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
                          <span
                            aria-label={`${item.title}完成进度`}
                            className="block h-full rounded-full bg-[#5b55df] transition-[width]"
                            style={{ width: `${progress}%` }}
                          />
                        </span>
                        <span className="w-10 text-right text-sm font-semibold text-slate-500">
                          {progress}%
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>

            <section
              className={`${surfaceClassName} grid overflow-hidden lg:grid-cols-[1.35fr_0.65fr]`}
            >
              {recommendedTask ? (
                <div className="overflow-hidden">
                  <div className="border-b border-slate-100 px-6 py-5 sm:px-7">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <h2 className="text-lg font-semibold text-slate-950">
                        当前推荐
                      </h2>
                      <div className="flex items-center gap-2 text-sm font-semibold text-violet-600">
                        <span>{statusLabels[recommendedTask.status]}</span>
                        <span className="text-slate-300" aria-hidden="true">
                          ·
                        </span>
                        <span>
                          {recommendedTask.estimatedMinutes >
                          assignment.checkIn.availableMinutes
                            ? `先做 ${recommendedMinutes} 分钟`
                            : `${recommendedMinutes} 分钟`}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="px-6 py-7 sm:px-7 sm:py-8">
                    <h3 className="max-w-2xl text-2xl font-semibold tracking-[-0.03em] text-slate-950 sm:text-3xl">
                      {recommendedTask.title}
                    </h3>
                    <button
                      className="mt-3 text-sm font-semibold text-violet-600"
                      onClick={() =>
                        selectAssignment(recommendedAssignment.id, "tasks")
                      }
                      type="button"
                    >
                      {recommendedAssignment.title}
                    </button>
                    <div className="mt-4 flex flex-wrap gap-2">
                      {recommendationReasons.map((reason) => (
                        <span
                          className="rounded-full bg-violet-50 px-3 py-1.5 text-sm font-semibold text-violet-700"
                          key={reason}
                        >
                          {reason}
                        </span>
                      ))}
                    </div>
                    <p className="mt-4 max-w-2xl text-base leading-7 text-slate-600">
                      {recommendedTask.completionCriteria}
                    </p>
                    {recommendedBlock ? (
                      <p className="mt-5 text-sm font-semibold text-slate-500">
                        {formatScheduleDate(recommendedBlock.date)} ·{" "}
                        {recommendedBlock.startTime}
                      </p>
                    ) : null}
                    {recommendedTask.status === "in_progress" ? (
                      <div className="mt-6 inline-flex items-center gap-3 rounded-xl bg-slate-950 px-4 py-3 text-white">
                        <span className="size-2 animate-pulse rounded-full bg-emerald-400" />
                        <span className="font-mono text-lg font-semibold tracking-wide">
                          {formatElapsedTime(recommendedElapsedSeconds)}
                        </span>
                        <span className="text-sm font-medium text-slate-300">
                          已进行
                        </span>
                      </div>
                    ) : null}
                    <div className="mt-8 flex flex-wrap gap-2">
                      {recommendedTask.status === "in_progress" ? (
                        <button
                          className={secondaryButtonClassName}
                          onClick={() =>
                            pauseTask(
                              recommendedTask.id,
                              recommendedAssignment.id,
                            )
                          }
                          type="button"
                        >
                          暂停
                        </button>
                      ) : (
                        <button
                          className={primaryButtonClassName}
                          onClick={() =>
                            startTask(
                              recommendedTask.id,
                              recommendedAssignment.id,
                            )
                          }
                          type="button"
                        >
                          {recommendedTask.status === "paused"
                            ? "继续"
                            : "开始"}
                        </button>
                      )}
                      <button
                        className={secondaryButtonClassName}
                        onClick={() =>
                          toggleCompleted(
                            recommendedTask.id,
                            recommendedAssignment.id,
                          )
                        }
                        type="button"
                      >
                        完成
                      </button>
                      <button
                        className={textButtonClassName}
                        onClick={() =>
                          postponeTask(
                            recommendedTask.id,
                            recommendedAssignment.id,
                          )
                        }
                        type="button"
                      >
                        延期
                      </button>
                      <button
                        className={textButtonClassName}
                        onClick={() =>
                          blockTask(
                            recommendedTask.id,
                            recommendedAssignment.id,
                          )
                        }
                        type="button"
                      >
                        卡住了
                      </button>
                      <button
                        className={textButtonClassName}
                        onClick={() =>
                          setRecommendationPickerOpen((open) => !open)
                        }
                        type="button"
                      >
                        手动选择
                      </button>
                    </div>
                    {recommendationPickerOpen ? (
                      <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-3">
                        <label
                          className="text-sm font-semibold text-slate-600"
                          htmlFor="manual-recommendation"
                        >
                          选择子任务
                        </label>
                        <select
                          className={fieldClassName}
                          id="manual-recommendation"
                          onChange={(event) => {
                            const [assignmentId, subtaskId] =
                              event.target.value.split("::");
                            if (!assignmentId || !subtaskId) return;
                            setManualRecommendation({
                              assignmentId,
                              subtaskId,
                            });
                            setRecommendationPickerOpen(false);
                          }}
                          value=""
                        >
                          <option value="">选择一个待完成子任务</option>
                          {pendingTaskOptions.map(
                            ({ assignment: item, task }) => (
                              <option
                                key={`${item.id}-${task.id}`}
                                value={`${item.id}::${task.id}`}
                              >
                                {item.title} · {task.title}
                              </option>
                            ),
                          )}
                        </select>
                      </div>
                    ) : null}
                  </div>
                </div>
              ) : (
                <div className="p-7">
                  <h2 className="text-xl font-semibold text-slate-950">
                    {completedCount === assignment.subtasks.length
                      ? "当前计划已完成"
                      : "当前没有可开始的任务"}
                  </h2>
                  {assignment.subtasks
                    .filter((task) => task.status === "blocked")
                    .map((task) => (
                      <button
                        className={`${secondaryButtonClassName} mt-5`}
                        key={task.id}
                        onClick={() => splitBlockedTask(task.id)}
                        type="button"
                      >
                        拆小一步
                      </button>
                    ))}
                </div>
              )}

              <div className="border-t border-slate-100 p-5 sm:p-6 lg:border-t-0 lg:border-l">
                <h2 className="text-lg font-semibold text-slate-950">
                  此刻可用时间 / 精力状态
                </h2>
                <div className="mt-5 space-y-4">
                  <FormField label="可用时间">
                    <select
                      className={fieldClassName}
                      id="check-in-time"
                      onChange={(event) =>
                        updateCheckIn({
                          availableMinutes: Number(event.target.value),
                        })
                      }
                      value={assignment.checkIn.availableMinutes}
                    >
                      <option value={15}>15 分钟</option>
                      <option value={30}>30 分钟</option>
                      <option value={60}>60 分钟</option>
                      <option value={90}>90 分钟</option>
                    </select>
                  </FormField>
                  <FormField label="精力">
                    <select
                      className={fieldClassName}
                      id="check-in-energy"
                      onChange={(event) =>
                        updateCheckIn({ energy: event.target.value as Energy })
                      }
                      value={assignment.checkIn.energy}
                    >
                      <option value="low">较低</option>
                      <option value="medium">正常</option>
                      <option value="high">充足</option>
                    </select>
                  </FormField>
                </div>
              </div>
            </section>

            <section className={`${surfaceClassName} p-5 sm:p-6`}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-lg font-semibold text-slate-950">
                  今日计划
                </h2>
                {todayPlanEditing ? (
                  <div className="flex gap-2">
                    <button
                      className={textButtonClassName}
                      onClick={() => setTodayPlanEditing(false)}
                      type="button"
                    >
                      取消
                    </button>
                    <button
                      className={primaryButtonClassName}
                      disabled={!/^\d{2}:\d{2}$/.test(todayPlanStartTime)}
                      onClick={saveTodayPlan}
                      type="button"
                    >
                      保存今日计划
                    </button>
                  </div>
                ) : (
                  <button
                    className={secondaryButtonClassName}
                    onClick={openTodayPlanEditor}
                    type="button"
                  >
                    手动调整今日计划
                  </button>
                )}
              </div>

              {todayPlanEditing ? (
                <div className="mt-5">
                  <div className="mb-5 max-w-56">
                    <FormField label="开始时间">
                      <input
                        className={fieldClassName}
                        id="today-plan-start-time"
                        onChange={(event) =>
                          setTodayPlanStartTime(event.target.value)
                        }
                        required
                        type="time"
                        value={todayPlanStartTime}
                      />
                    </FormField>
                  </div>
                  <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
                    {todayPlanDraft.map((draft, index) => {
                      const item = assignments.find(
                        (candidate) => candidate.id === draft.assignmentId,
                      );
                      const task = item?.subtasks.find(
                        (candidate) => candidate.id === draft.subtaskId,
                      );
                      if (!item || !task) return null;
                      return (
                        <li
                          className="grid gap-3 px-4 py-4 sm:grid-cols-[minmax(0,1fr)_8rem_auto] sm:items-center"
                          key={draft.blockId}
                        >
                          <span className="min-w-0">
                            <span className="block truncate font-semibold text-slate-900">
                              {task.title}
                            </span>
                            <span className="mt-1 block truncate text-sm font-medium text-slate-500">
                              {item.title}
                            </span>
                          </span>
                          <label className="flex items-center gap-2 text-sm font-medium text-slate-500">
                            <input
                              aria-label={`${task.title}今日计划分钟`}
                              className="w-20 rounded-lg border border-slate-200 px-3 py-2 text-right text-slate-900 outline-none focus:border-violet-500 focus:ring-4 focus:ring-violet-500/10"
                              min={5}
                              onChange={(event) => {
                                const durationMinutes = Math.max(
                                  5,
                                  Number(event.target.value) || 5,
                                );
                                setTodayPlanDraft((current) =>
                                  current.map((entry) =>
                                    entry.blockId === draft.blockId
                                      ? { ...entry, durationMinutes }
                                      : entry,
                                  ),
                                );
                              }}
                              step={5}
                              type="number"
                              value={draft.durationMinutes}
                            />
                            分钟
                          </label>
                          <span className="flex items-center justify-end gap-1">
                            <button
                              aria-label={`上移 ${task.title}`}
                              className={textButtonClassName}
                              disabled={index === 0}
                              onClick={() => moveTodayPlanItem(index, -1)}
                              type="button"
                            >
                              上移
                            </button>
                            <button
                              aria-label={`下移 ${task.title}`}
                              className={textButtonClassName}
                              disabled={index === todayPlanDraft.length - 1}
                              onClick={() => moveTodayPlanItem(index, 1)}
                              type="button"
                            >
                              下移
                            </button>
                            <button
                              aria-label={`移出今日计划 ${task.title}`}
                              className={textButtonClassName}
                              onClick={() =>
                                setTodayPlanDraft((current) =>
                                  current.filter(
                                    (entry) => entry.blockId !== draft.blockId,
                                  ),
                                )
                              }
                              type="button"
                            >
                              移出
                            </button>
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                  <label
                    className="mt-4 block text-sm font-semibold text-slate-600"
                    htmlFor="add-today-task"
                  >
                    添加子任务
                  </label>
                  <select
                    className={fieldClassName}
                    id="add-today-task"
                    onChange={(event) => {
                      addTodayPlanTask(event.target.value);
                      event.target.value = "";
                    }}
                    defaultValue=""
                  >
                    <option value="">选择待完成子任务</option>
                    {pendingTaskOptions.map(({ assignment: item, task }) => (
                      <option
                        key={`${item.id}-${task.id}`}
                        value={`${item.id}::${task.id}`}
                      >
                        {item.title} · {task.title}
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <>
                  <ul className="mt-4 divide-y divide-slate-100">
                    {todayBlocks.map(({ assignment: item, block }) => (
                      <li
                        className="grid grid-cols-[4.5rem_minmax(0,1fr)_auto] items-center gap-3 py-3.5"
                        key={`${item.id}-${block.id}`}
                      >
                        <span className="text-sm font-semibold text-slate-500">
                          {block.startTime}
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate font-semibold text-slate-800">
                            {item.subtasks.find(
                              (task) => task.id === block.subtaskId,
                            )?.title ?? "任务"}
                          </span>
                          <span className="block truncate text-sm font-medium text-slate-400">
                            {item.title}
                          </span>
                        </span>
                        <span className="text-sm font-medium text-slate-400">
                          {block.durationMinutes} 分钟
                        </span>
                      </li>
                    ))}
                  </ul>
                  {todayBlocks.length === 0 ? (
                    <p className="mt-5 text-slate-500">今天还没有安排任务。</p>
                  ) : null}
                  <div className="mt-6 border-t border-slate-100 pt-5">
                    <div className="flex items-center justify-between gap-4 text-sm font-semibold">
                      <span className="text-slate-600">今日任务进度</span>
                      <span className="text-violet-700">{todayProgress}%</span>
                    </div>
                    <div
                      aria-label="今日任务进度"
                      aria-valuemax={100}
                      aria-valuemin={0}
                      aria-valuenow={todayProgress}
                      className="mt-3 h-2.5 overflow-hidden rounded-full bg-slate-100"
                      role="progressbar"
                    >
                      <div
                        className="h-full rounded-full bg-[#5b55df] transition-[width]"
                        style={{ width: `${todayProgress}%` }}
                      />
                    </div>
                  </div>
                </>
              )}
            </section>
          </section>
        ) : null}

        {dashboardView === "tasks" ? (
          <section>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {assignments.map((item) => {
                const done = item.subtasks.filter(
                  (task) => task.status === "completed",
                ).length;
                const selected = item.id === assignment.id;
                return (
                  <button
                    aria-pressed={selected}
                    className={`rounded-2xl border p-5 text-left transition focus:ring-4 focus:ring-violet-500/10 focus:outline-none ${
                      selected
                        ? "border-violet-300 bg-violet-50 shadow-[0_10px_28px_rgba(91,85,223,0.10)]"
                        : "border-slate-200 bg-white hover:border-violet-200"
                    }`}
                    key={item.id}
                    onClick={() => selectAssignment(item.id, "tasks")}
                    type="button"
                  >
                    <span className="block text-lg font-semibold text-slate-950">
                      {item.title}
                    </span>
                    <span className="mt-3 flex items-center justify-between gap-3 text-sm font-semibold text-slate-500">
                      <span>截止 {formatDate(item.deadline)}</span>
                      <span>
                        {done}/{item.subtasks.length}
                      </span>
                    </span>
                  </button>
                );
              })}
              <button
                className="flex min-h-28 items-center justify-center rounded-2xl border border-dashed border-violet-300 bg-white p-5 font-semibold text-violet-700 transition hover:bg-violet-50 focus:ring-4 focus:ring-violet-500/10 focus:outline-none"
                onClick={openCreate}
                type="button"
              >
                ＋ 新建任务
              </button>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-4">
              <p className="mt-8 font-medium text-slate-500">
                {remainingMinutes} 分钟待完成
              </p>
              <div className="mt-8 flex flex-wrap gap-2">
                <button
                  aria-controls="task-ai-panel"
                  aria-expanded={taskAdjustmentMode === "ai"}
                  className={
                    taskAdjustmentMode === "ai"
                      ? primaryButtonClassName
                      : secondaryButtonClassName
                  }
                  onClick={() =>
                    setTaskAdjustmentMode((mode) =>
                      mode === "ai" ? null : "ai",
                    )
                  }
                  type="button"
                >
                  AI任务调整
                </button>
                <button
                  aria-controls="manual-task-editor"
                  aria-expanded={taskAdjustmentMode === "manual"}
                  className={
                    taskAdjustmentMode === "manual"
                      ? primaryButtonClassName
                      : secondaryButtonClassName
                  }
                  onClick={() =>
                    setTaskAdjustmentMode((mode) =>
                      mode === "manual" ? null : "manual",
                    )
                  }
                  type="button"
                >
                  手动任务调整
                </button>
              </div>
            </div>
            <div
              className={`mt-5 grid items-start gap-5 ${
                taskAdjustmentMode === "ai"
                  ? "xl:grid-cols-[minmax(0,1fr)_minmax(24rem,0.78fr)]"
                  : ""
              }`}
            >
              <ul
                className={`${surfaceClassName} divide-y divide-slate-100 overflow-hidden`}
                id={
                  taskAdjustmentMode === "manual"
                    ? "manual-task-editor"
                    : undefined
                }
              >
                {taskAdjustmentMode === "manual"
                  ? assignment.subtasks.map((subtask, index) => (
                      <ManualSubtaskRow
                        canDelete={assignment.subtasks.length > 1}
                        index={index}
                        key={subtask.id}
                        onChange={(patch) =>
                          updateManualSubtask(subtask.id, patch)
                        }
                        onDelete={() => deleteManualSubtask(subtask.id)}
                        onDragEnd={() => {
                          draggedTaskIdRef.current = null;
                        }}
                        onDragStart={() => {
                          draggedTaskIdRef.current = subtask.id;
                        }}
                        onDrop={(sourceId) => {
                          const resolvedSourceId =
                            sourceId || draggedTaskIdRef.current;
                          draggedTaskIdRef.current = null;
                          if (resolvedSourceId) {
                            reorderManualSubtasks(resolvedSourceId, subtask.id);
                          }
                        }}
                        onToggleCompleted={() => toggleCompleted(subtask.id)}
                        subtask={subtask}
                      />
                    ))
                  : assignment.subtasks.map((subtask) => (
                      <li
                        className="flex items-start gap-4 px-5 py-4 sm:px-6"
                        key={subtask.id}
                      >
                        <input
                          aria-label={`完成 ${subtask.title}`}
                          checked={subtask.status === "completed"}
                          className="mt-0.5 size-5 rounded border-slate-300 accent-violet-600"
                          onChange={() => toggleCompleted(subtask.id)}
                          type="checkbox"
                        />
                        <div className="min-w-0 flex-1">
                          <span
                            className={`font-semibold ${
                              subtask.status === "completed"
                                ? "text-slate-400 line-through"
                                : "text-slate-900"
                            }`}
                          >
                            {subtask.title}
                          </span>
                          <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-sm font-medium text-slate-500">
                            <span>{statusLabels[subtask.status]}</span>
                            <span>计划 {subtask.estimatedMinutes} 分钟</span>
                            <span>实际 {subtask.actualMinutes} 分钟</span>
                          </div>
                          {subtask.status === "blocked" ? (
                            <button
                              className={`${textButtonClassName} mt-2 -ml-2.5`}
                              onClick={() => splitBlockedTask(subtask.id)}
                              type="button"
                            >
                              拆小一步
                            </button>
                          ) : null}
                        </div>
                      </li>
                    ))}
                {taskAdjustmentMode === "manual" ? (
                  <li className="p-4 sm:p-5">
                    <button
                      className="flex min-h-12 w-full items-center justify-center rounded-xl border border-dashed border-violet-300 font-semibold text-violet-700 transition hover:bg-violet-50 focus:ring-4 focus:ring-violet-500/10 focus:outline-none"
                      onClick={addManualSubtask}
                      type="button"
                    >
                      ＋ 添加子任务
                    </button>
                  </li>
                ) : null}
              </ul>

              {taskAdjustmentMode === "ai" ? (
                <aside
                  aria-label="AI 对话调整"
                  className={`${surfaceClassName} flex min-h-[620px] flex-col overflow-hidden xl:sticky xl:top-6 xl:max-h-[calc(100dvh-3rem)]`}
                  id="task-ai-panel"
                >
                  <div className="flex items-center justify-between gap-4 border-b border-slate-100 px-5 py-4 sm:px-6">
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-violet-100 font-bold text-violet-700">
                        AI
                      </div>
                      <div className="min-w-0">
                        <h2 className="font-semibold text-slate-950">
                          PacePal
                        </h2>
                        <p className="truncate text-sm font-medium text-slate-500">
                          {assignment.title}
                        </p>
                      </div>
                    </div>
                    <button
                      className={textButtonClassName}
                      onClick={() => setTaskAdjustmentMode(null)}
                      type="button"
                    >
                      隐藏
                    </button>
                  </div>

                  <div
                    aria-live="polite"
                    className="min-h-0 flex-1 space-y-4 overflow-y-auto bg-slate-50/60 px-5 py-6 sm:px-6"
                  >
                    {assignment.chatMessages.length === 0 ? (
                      <div className="max-w-[88%] rounded-2xl rounded-tl-md border border-slate-200 bg-white px-4 py-3 leading-7 text-slate-700 shadow-sm">
                        告诉我哪里需要调整，我会更新任务和后续安排。
                      </div>
                    ) : null}
                    {assignment.chatMessages.map((message) => (
                      <div
                        className={`flex ${
                          message.role === "user"
                            ? "justify-end"
                            : "justify-start"
                        }`}
                        key={message.id}
                      >
                        <p
                          className={`max-w-[88%] rounded-2xl px-4 py-3 leading-7 whitespace-pre-wrap shadow-sm ${
                            message.role === "user"
                              ? "rounded-tr-md bg-[#5b55df] text-white"
                              : "rounded-tl-md border border-slate-200 bg-white text-slate-700"
                          }`}
                        >
                          {message.content}
                        </p>
                      </div>
                    ))}
                    {chatBusy ? (
                      <div className="max-w-[88%] rounded-2xl rounded-tl-md border border-slate-200 bg-white px-4 py-3 font-medium text-slate-500 shadow-sm">
                        正在分析进度与依赖…
                      </div>
                    ) : null}
                  </div>

                  <div className="border-t border-slate-100 bg-white p-4 sm:p-5">
                    <div className="mb-3 flex flex-wrap gap-2">
                      {[
                        "把当前任务拆小",
                        "检查并校准任务耗时",
                        "依据进度和阻塞优化计划",
                      ].map((prompt) => (
                        <button
                          className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold text-slate-600 transition hover:border-violet-300 hover:bg-violet-50 hover:text-violet-700 focus:ring-4 focus:ring-violet-500/10 focus:outline-none disabled:opacity-50"
                          disabled={chatBusy}
                          key={prompt}
                          onClick={() => void sendChatMessage(prompt)}
                          type="button"
                        >
                          {prompt}
                        </button>
                      ))}
                    </div>
                    <form
                      className="flex items-end gap-3"
                      onSubmit={submitChat}
                    >
                      <label className="sr-only" htmlFor="chat-message">
                        给 AI 助手的消息
                      </label>
                      <textarea
                        className="min-h-12 flex-1 resize-none rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-base text-slate-950 transition outline-none focus:border-violet-500 focus:bg-white focus:ring-4 focus:ring-violet-500/10"
                        disabled={chatBusy}
                        id="chat-message"
                        onChange={(event) => setChatDraft(event.target.value)}
                        placeholder="输入你想调整的内容"
                        rows={1}
                        value={chatDraft}
                      />
                      <button
                        className={primaryButtonClassName}
                        disabled={chatBusy || !chatDraft.trim()}
                        type="submit"
                      >
                        发送
                      </button>
                    </form>
                  </div>
                </aside>
              ) : null}
            </div>
          </section>
        ) : null}

        {dashboardView === "schedule" ? (
          <CalendarMonthView
            assignments={assignments}
            onSelectAssignment={(assignmentId) =>
              selectAssignment(assignmentId, "tasks")
            }
          />
        ) : null}
      </div>
    </WorkspaceFrame>
  );
}

function WorkspaceFrame({
  accountLabel,
  activeView,
  children,
  onAccount,
  onNavigate,
  syncLabel,
}: {
  accountLabel: string;
  activeView: DashboardView;
  children: React.ReactNode;
  onAccount: () => void;
  onNavigate: (view: DashboardView) => void;
  syncLabel: string;
}) {
  const navigation: Array<{ label: string; view: DashboardView }> = [
    { label: "概览", view: "overview" },
    { label: "任务", view: "tasks" },
    { label: "日历", view: "schedule" },
  ];

  return (
    <div className="min-h-dvh bg-[#f6f7fb]">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-slate-200/80 bg-white px-4 py-6 lg:flex">
        <div className="flex items-center gap-3 px-2">
          <span className="flex size-9 items-center justify-center rounded-xl bg-[#5b55df] text-lg font-bold text-white shadow-[0_8px_18px_rgba(91,85,223,0.25)]">
            P
          </span>
          <span className="text-xl font-semibold tracking-[-0.03em] text-slate-950">
            PacePal
          </span>
        </div>

        <nav aria-label="主要导航" className="mt-10 space-y-1">
          {navigation.map((item) => {
            const active = item.view === activeView;
            return (
              <button
                aria-current={active ? "page" : undefined}
                className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left font-semibold transition focus:ring-4 focus:ring-violet-500/10 focus:outline-none ${
                  active
                    ? "bg-violet-50 text-violet-700"
                    : "text-slate-500 hover:bg-slate-50 hover:text-slate-950"
                }`}
                key={item.view}
                onClick={() => onNavigate(item.view)}
                type="button"
              >
                <WorkspaceIcon view={item.view} />
                {item.label}
              </button>
            );
          })}
        </nav>

        <div className="mt-auto space-y-2">
          <p className="px-3 text-xs font-semibold text-slate-400">
            {syncLabel}
          </p>
          <button
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left font-semibold text-slate-600 transition hover:bg-slate-50 hover:text-slate-950 focus:ring-4 focus:ring-violet-500/10 focus:outline-none"
            onClick={onAccount}
            type="button"
          >
            <span className="flex size-8 items-center justify-center rounded-full bg-slate-100 text-sm font-bold text-slate-600">
              {accountLabel.slice(0, 1).toUpperCase()}
            </span>
            <span className="min-w-0 truncate">{accountLabel}</span>
          </button>
        </div>
      </aside>

      <div className="lg:pl-60">
        <header className="sticky top-0 z-20 border-b border-slate-200/80 bg-white/90 backdrop-blur-xl lg:hidden">
          <div className="flex h-16 items-center justify-between px-5">
            <div className="flex items-center gap-2.5">
              <span className="flex size-8 items-center justify-center rounded-lg bg-[#5b55df] font-bold text-white">
                P
              </span>
              <span className="text-lg font-semibold tracking-[-0.03em] text-slate-950">
                PacePal
              </span>
            </div>
            <button
              className={textButtonClassName}
              onClick={onAccount}
              type="button"
            >
              {accountLabel}
            </button>
          </div>
          <nav
            aria-label="主要导航"
            className="flex gap-1 overflow-x-auto px-4 pb-3"
          >
            {navigation.map((item) => {
              const active = item.view === activeView;
              return (
                <button
                  aria-current={active ? "page" : undefined}
                  className={`shrink-0 rounded-lg px-3 py-2 text-sm font-semibold transition focus:ring-4 focus:ring-violet-500/10 focus:outline-none ${
                    active ? "bg-violet-50 text-violet-700" : "text-slate-500"
                  }`}
                  key={item.view}
                  onClick={() => onNavigate(item.view)}
                  type="button"
                >
                  {item.label}
                </button>
              );
            })}
          </nav>
        </header>
        <main>{children}</main>
      </div>
    </div>
  );
}

function WorkspaceIcon({ view }: { view: DashboardView }) {
  if (view === "overview") {
    return (
      <svg
        aria-hidden="true"
        className="size-5"
        fill="none"
        viewBox="0 0 24 24"
      >
        <path
          d="M4 13h6V4H4v9Zm10 7h6V11h-6v9ZM4 20h6v-3H4v3Zm10-13h6V4h-6v3Z"
          stroke="currentColor"
          strokeLinejoin="round"
          strokeWidth="1.8"
        />
      </svg>
    );
  }
  if (view === "tasks") {
    return (
      <svg
        aria-hidden="true"
        className="size-5"
        fill="none"
        viewBox="0 0 24 24"
      >
        <path
          d="m4 7 2 2 3-4M12 7h8M4 15l2 2 3-4M12 15h8"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.8"
        />
      </svg>
    );
  }
  return (
    <svg aria-hidden="true" className="size-5" fill="none" viewBox="0 0 24 24">
      <path
        d="M6 3v3M18 3v3M4 9h16M5 5h14a1 1 0 0 1 1 1v14H4V6a1 1 0 0 1 1-1Z"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    </svg>
  );
}

function AppFrame({
  accountLabel,
  children,
  onAccount,
}: {
  accountLabel: string;
  children: React.ReactNode;
  onAccount: () => void;
}) {
  return (
    <div className="min-h-dvh bg-[#f5f7fa] bg-[radial-gradient(circle_at_top,rgba(219,234,254,0.42),transparent_34rem)]">
      <header className="sticky top-0 z-20 border-b border-slate-200/70 bg-white/80 backdrop-blur-xl">
        <div className="mx-auto flex h-[76px] max-w-6xl items-center justify-between px-5 sm:px-8">
          <span className="text-xl font-bold tracking-[-0.03em] text-slate-950">
            PacePal
          </span>
          <button
            className={textButtonClassName}
            onClick={onAccount}
            type="button"
          >
            {accountLabel}
          </button>
        </div>
      </header>
      <main className="px-5 sm:px-8">{children}</main>
    </div>
  );
}

function FormField({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  const childId =
    typeof children === "object" && children && "props" in children
      ? (children.props as { id?: string }).id
      : undefined;

  return (
    <div>
      <label className="font-medium text-slate-800" htmlFor={childId}>
        {label}
      </label>
      {children}
      {error ? (
        <p className="mt-2 text-sm font-medium text-red-700" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function ManualSubtaskRow({
  canDelete,
  index,
  onChange,
  onDelete,
  onDragEnd,
  onDragStart,
  onDrop,
  onToggleCompleted,
  subtask,
}: {
  canDelete: boolean;
  index: number;
  onChange: (patch: Partial<Subtask>) => void;
  onDelete: () => void;
  onDragEnd: () => void;
  onDragStart: () => void;
  onDrop: (sourceId: string) => void;
  onToggleCompleted: () => void;
  subtask: Subtask;
}) {
  const [title, setTitle] = useState(subtask.title);
  const [description, setDescription] = useState(subtask.description);
  const [completionCriteria, setCompletionCriteria] = useState(
    subtask.completionCriteria,
  );
  const [estimatedMinutes, setEstimatedMinutes] = useState(
    String(subtask.estimatedMinutes),
  );

  function commitText(
    value: string,
    fallback: string,
    patch: (normalized: string) => Partial<Subtask>,
    setValue: (normalized: string) => void,
  ) {
    const normalized = value.trim() || fallback;
    setValue(normalized);
    if (normalized !== fallback) onChange(patch(normalized));
  }

  function commitMinutes() {
    const parsed = Number.parseInt(estimatedMinutes, 10);
    const normalized = Number.isFinite(parsed) ? Math.max(5, parsed) : 30;
    setEstimatedMinutes(String(normalized));
    if (normalized !== subtask.estimatedMinutes) {
      onChange({ estimatedMinutes: normalized });
    }
  }

  return (
    <li
      className="px-4 py-4 transition sm:px-5"
      data-testid={`manual-subtask-${subtask.id}`}
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault();
        const sourceId = event.dataTransfer.getData("text/plain");
        onDrop(sourceId);
      }}
      onPointerUp={() => onDrop("")}
    >
      <div className="grid grid-cols-[auto_auto_minmax(0,1fr)] items-center gap-3 sm:grid-cols-[auto_auto_minmax(0,1fr)_auto_auto]">
        <button
          aria-label={`拖动 ${subtask.title}`}
          className="cursor-grab rounded-lg px-2 py-2 text-xl leading-none text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 focus:ring-4 focus:ring-violet-500/10 focus:outline-none active:cursor-grabbing"
          draggable
          onDragEnd={onDragEnd}
          onDragStart={(event) => {
            event.dataTransfer.effectAllowed = "move";
            event.dataTransfer.setData("text/plain", subtask.id);
            onDragStart();
          }}
          onPointerDown={onDragStart}
          type="button"
        >
          ⠿
        </button>
        <input
          aria-label={`完成 ${subtask.title}`}
          checked={subtask.status === "completed"}
          className="size-5 shrink-0 rounded border-slate-300 accent-violet-600"
          onChange={onToggleCompleted}
          type="checkbox"
        />
        <label className="sr-only" htmlFor={`manual-title-${subtask.id}`}>
          任务名称 {index + 1}
        </label>
        <input
          className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 font-semibold text-slate-950 transition outline-none focus:border-violet-500 focus:ring-4 focus:ring-violet-500/10"
          id={`manual-title-${subtask.id}`}
          onBlur={() =>
            commitText(
              title,
              subtask.title,
              (normalized) => ({ title: normalized }),
              setTitle,
            )
          }
          onChange={(event) => setTitle(event.target.value)}
          value={title}
        />
        <label className="sr-only" htmlFor={`manual-minutes-${subtask.id}`}>
          预计分钟 {index + 1}
        </label>
        <div className="col-start-3 flex shrink-0 items-center gap-2 sm:col-start-auto">
          <input
            className="w-20 rounded-lg border border-slate-200 bg-white px-3 py-2 text-right text-slate-950 transition outline-none focus:border-violet-500 focus:ring-4 focus:ring-violet-500/10"
            id={`manual-minutes-${subtask.id}`}
            min={5}
            onBlur={commitMinutes}
            onChange={(event) => setEstimatedMinutes(event.target.value)}
            step={5}
            type="number"
            value={estimatedMinutes}
          />
          <span className="text-sm font-medium text-slate-500">分钟</span>
        </div>
        <button
          aria-label={`删除 ${subtask.title}`}
          className={`${textButtonClassName} col-start-3 justify-self-start sm:col-start-auto`}
          disabled={!canDelete}
          onClick={onDelete}
          type="button"
        >
          删除
        </button>
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 sm:pl-12">
        <label className="sr-only" htmlFor={`manual-description-${subtask.id}`}>
          具体行动 {index + 1}
        </label>
        <input
          className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-slate-700 transition outline-none focus:border-violet-500 focus:bg-white focus:ring-4 focus:ring-violet-500/10"
          id={`manual-description-${subtask.id}`}
          onBlur={() =>
            commitText(
              description,
              subtask.description,
              (normalized) => ({ description: normalized }),
              setDescription,
            )
          }
          onChange={(event) => setDescription(event.target.value)}
          placeholder="具体行动"
          value={description}
        />
        <label className="sr-only" htmlFor={`manual-criteria-${subtask.id}`}>
          完成标准 {index + 1}
        </label>
        <input
          className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-slate-700 transition outline-none focus:border-violet-500 focus:bg-white focus:ring-4 focus:ring-violet-500/10"
          id={`manual-criteria-${subtask.id}`}
          onBlur={() =>
            commitText(
              completionCriteria,
              subtask.completionCriteria,
              (normalized) => ({ completionCriteria: normalized }),
              setCompletionCriteria,
            )
          }
          onChange={(event) => setCompletionCriteria(event.target.value)}
          placeholder="完成标准"
          value={completionCriteria}
        />
      </div>
      <p className="mt-2 text-sm font-medium text-slate-400 sm:pl-12">
        {statusLabels[subtask.status]}
        {subtask.actualMinutes > 0
          ? ` · 实际 ${subtask.actualMinutes} 分钟`
          : ""}
      </p>
    </li>
  );
}

function SubtaskEditor({
  subtask,
  onChange,
  onDone,
}: {
  subtask: Subtask;
  onChange: (patch: Partial<Subtask>) => void;
  onDone: () => void;
}) {
  return (
    <div className="space-y-4 rounded-xl border border-indigo-200 bg-white p-4 sm:p-5">
      <FormField label="任务名称">
        <input
          className={fieldClassName}
          id={`title-${subtask.id}`}
          value={subtask.title}
          onChange={(event) => onChange({ title: event.target.value })}
        />
      </FormField>
      <FormField label="具体行动">
        <textarea
          className={`${fieldClassName} min-h-24 resize-y`}
          id={`description-${subtask.id}`}
          value={subtask.description}
          onChange={(event) => onChange({ description: event.target.value })}
        />
      </FormField>
      <div className="grid gap-4 sm:grid-cols-[1fr_10rem]">
        <FormField label="完成标准">
          <input
            className={fieldClassName}
            id={`criteria-${subtask.id}`}
            value={subtask.completionCriteria}
            onChange={(event) =>
              onChange({ completionCriteria: event.target.value })
            }
          />
        </FormField>
        <FormField label="预计分钟">
          <input
            className={fieldClassName}
            id={`duration-${subtask.id}`}
            min={5}
            step={5}
            type="number"
            value={subtask.estimatedMinutes}
            onChange={(event) =>
              onChange({ estimatedMinutes: Number(event.target.value) })
            }
          />
        </FormField>
      </div>
      <div className="flex justify-end">
        <button
          className={secondaryButtonClassName}
          onClick={onDone}
          type="button"
        >
          完成编辑
        </button>
      </div>
    </div>
  );
}
