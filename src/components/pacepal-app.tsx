"use client";

import type { User } from "@supabase/supabase-js";
import { type FormEvent, useEffect, useMemo, useState } from "react";

import {
  loadCloudState,
  saveCloudState,
} from "@/features/pacepal/cloud-storage";
import {
  emptyAppState,
  type Assignment,
  type AssignmentInput,
  type AppState,
  type ScheduleBlock,
  type Subtask,
} from "@/features/pacepal/model";
import {
  generateMockPlan,
  normalizeDependencies,
} from "@/features/pacepal/mock-planner";
import { requestPlan } from "@/features/pacepal/plan-api";
import { buildSchedule } from "@/features/pacepal/scheduler";
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

type Screen = "dashboard" | "create" | "plan" | "availability" | "account";
type DashboardView = "today" | "tasks" | "schedule";
type SyncStatus = "local" | "loading" | "saving" | "synced" | "error";
type FormErrors = Partial<Record<keyof AssignmentInput, string>>;

const emptyForm: AssignmentInput = {
  title: "",
  requirements: "",
  deliverable: "",
  deadline: "",
  priority: "medium",
};

const fieldClassName =
  "mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-base text-slate-950 outline-none transition focus:border-indigo-600 focus:ring-2 focus:ring-indigo-100";
const primaryButtonClassName =
  "inline-flex min-h-11 items-center justify-center rounded-lg bg-indigo-600 px-5 py-2.5 font-medium text-white transition hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-300 disabled:cursor-not-allowed disabled:opacity-50";
const secondaryButtonClassName =
  "inline-flex min-h-10 items-center justify-center rounded-lg border border-slate-300 bg-white px-4 py-2 font-medium text-slate-700 transition hover:border-slate-400 hover:text-slate-950 focus:outline-none focus:ring-2 focus:ring-indigo-200";
const textButtonClassName =
  "rounded-md px-2 py-1.5 text-sm font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-950 focus:outline-none focus:ring-2 focus:ring-indigo-200";

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

function validateAssignment(form: AssignmentInput) {
  const errors: FormErrors = {};

  if (!form.title.trim()) errors.title = "请输入作业名称";
  if (!form.requirements.trim()) errors.requirements = "请输入作业要求";
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
  const [dashboardView, setDashboardView] = useState<DashboardView>("today");
  const [formMode, setFormMode] = useState<"create" | "edit">("create");
  const [form, setForm] = useState<AssignmentInput>(emptyForm);
  const [errors, setErrors] = useState<FormErrors>({});
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [planError, setPlanError] = useState("");
  const [planNotice, setPlanNotice] = useState("");
  const [planBusy, setPlanBusy] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [cloudReady, setCloudReady] = useState(false);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("local");
  const [authEmail, setAuthEmail] = useState("");
  const [authMessage, setAuthMessage] = useState("");
  const [authError, setAuthError] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const userId = user?.id ?? null;

  useEffect(() => {
    let cancelled = false;

    async function initialize() {
      let storedState = loadAppState();
      const storedOwner = loadAppStateOwner();

      if (!cloudEnabled) {
        if (!cancelled) {
          setAppState(storedState);
          if (storedState.assignment?.status === "planning") setScreen("plan");
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
            if (storedState.assignment?.status === "planning") {
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
            if (nextState.assignment?.status === "planning") setScreen("plan");
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

  const assignment = appState.assignment;
  const completedCount =
    assignment?.subtasks.filter((subtask) => subtask.status === "completed")
      .length ?? 0;
  const progress = assignment?.subtasks.length
    ? Math.round((completedCount / assignment.subtasks.length) * 100)
    : 0;

  const taskById = useMemo(
    () =>
      new Map(
        (assignment?.subtasks ?? []).map((subtask) => [subtask.id, subtask]),
      ),
    [assignment?.subtasks],
  );

  const groupedSchedule = useMemo(() => {
    const grouped = new Map<string, ScheduleBlock[]>();
    if (!assignment) return [];

    for (const block of assignment.schedule) {
      const dateBlocks = grouped.get(block.date) ?? [];
      dateBlocks.push(block);
      grouped.set(block.date, dateBlocks);
    }

    return Array.from(grouped.entries());
  }, [assignment]);

  function updateAssignment(updater: (current: Assignment) => Assignment) {
    setAppState((current) => {
      if (!current.assignment) return current;
      return { ...current, assignment: updater(current.assignment) };
    });
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
    setPlanNotice("");
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

    if (formMode === "edit" && assignment) {
      const scheduleResult = buildSchedule(
        assignment.subtasks,
        form.deadline,
        assignment.availability,
      );
      updateAssignment((current) => ({
        ...current,
        ...form,
        schedule: scheduleResult.blocks,
        unscheduledMinutes: scheduleResult.unscheduledMinutes,
      }));
      setScreen(assignment.status === "scheduled" ? "dashboard" : "plan");
      return;
    }

    setPlanBusy(true);
    setPlanNotice("");

    let subtasks: Subtask[];
    try {
      const plan = await requestPlan(form);
      subtasks = plan.subtasks;
      if (plan.fallback) {
        setPlanNotice("AI 暂时不可用，已生成基础计划");
      }
    } catch {
      subtasks = generateMockPlan(form);
      setPlanNotice("AI 暂时不可用，已生成基础计划");
    } finally {
      setPlanBusy(false);
    }

    const nextAssignment: Assignment = {
      ...form,
      id: createId("assignment"),
      createdAt: new Date().toISOString(),
      status: "planning",
      subtasks,
      availability: { dailyMinutes: 60, preferredTime: "18:00" },
      schedule: [],
      unscheduledMinutes: 0,
    };

    setAppState({ version: 1, assignment: nextAssignment });
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
      return { ...current, subtasks: normalizeDependencies(reordered) };
    });
  }

  function deleteSubtask(id: string) {
    updateAssignment((current) => ({
      ...current,
      subtasks: normalizeDependencies(
        current.subtasks.filter((subtask) => subtask.id !== id),
      ),
    }));
    setEditingTaskId((current) => (current === id ? null : current));
  }

  function addSubtask() {
    const id = createId("task");
    updateAssignment((current) => ({
      ...current,
      subtasks: normalizeDependencies([
        ...current.subtasks,
        {
          id,
          title: "新任务",
          description: "写下完成这一步需要做什么。",
          estimatedMinutes: 30,
          completionCriteria: "写下明确的完成标准",
          difficulty: "medium",
          dependencies: [],
          status: "todo",
        },
      ]),
    }));
    setEditingTaskId(id);
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
    setScreen("availability");
  }

  function createSchedule(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!assignment) return;

    const result = buildSchedule(
      assignment.subtasks,
      assignment.deadline,
      assignment.availability,
    );

    updateAssignment((current) => ({
      ...current,
      status: "scheduled",
      schedule: result.blocks,
      unscheduledMinutes: result.unscheduledMinutes,
    }));
    setDashboardView("today");
    setScreen("dashboard");
  }

  function toggleCompleted(id: string) {
    if (!assignment) return;

    const subtasks = assignment.subtasks.map((subtask) =>
      subtask.id === id
        ? {
            ...subtask,
            status:
              subtask.status === "completed"
                ? ("todo" as const)
                : ("completed" as const),
          }
        : subtask,
    );
    const result = buildSchedule(
      subtasks,
      assignment.deadline,
      assignment.availability,
    );

    updateAssignment((current) => ({
      ...current,
      subtasks,
      schedule: result.blocks,
      unscheduledMinutes: result.unscheduledMinutes,
    }));
  }

  function deleteAssignment() {
    if (!window.confirm("删除当前作业计划？")) return;
    clearAppState();
    setAppState(emptyAppState);
    setScreen("dashboard");
    setDashboardView("today");
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
              <h1 className="text-3xl font-semibold tracking-tight text-slate-950">
                本机保存
              </h1>
              <p className="mt-6 text-slate-600">云端服务尚未配置。</p>
            </div>
          ) : user ? (
            <div className="mt-6">
              <h1 className="text-3xl font-semibold tracking-tight text-slate-950">
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
              <h1 className="text-3xl font-semibold tracking-tight text-slate-950">
                登录
              </h1>
              <form className="mt-8 space-y-6" onSubmit={sendLoginLink}>
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
          <h1 className="mt-6 text-3xl font-semibold tracking-tight text-slate-950">
            {formMode === "create" ? "创建作业" : "编辑作业"}
          </h1>

          <form className="mt-8 space-y-6" onSubmit={handleAssignmentSubmit}>
            <FormField label="作业名称" error={errors.title}>
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

            <FormField label="作业要求" error={errors.requirements}>
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

            <div className="flex justify-end pt-2">
              <button
                className={primaryButtonClassName}
                disabled={planBusy}
                type="submit"
              >
                {planBusy
                  ? "正在生成"
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
            编辑作业
          </button>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h1 className="text-3xl font-semibold tracking-tight text-slate-950">
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

          {planNotice ? (
            <p
              className="mt-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 font-medium text-amber-900"
              role="status"
            >
              {planNotice}
            </p>
          ) : null}

          <ol className="mt-8 divide-y divide-slate-200 border-y border-slate-200">
            {assignment.subtasks.map((subtask, index) => (
              <li className="py-5" key={subtask.id}>
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

  if (screen === "availability" && assignment) {
    return (
      <AppFrame {...appFrameProps}>
        <div className="mx-auto w-full max-w-xl py-10 sm:py-16">
          <button
            className={textButtonClassName}
            onClick={() => setScreen("plan")}
            type="button"
          >
            返回
          </button>
          <h1 className="mt-6 text-3xl font-semibold tracking-tight text-slate-950">
            安排学习时间
          </h1>

          <form className="mt-8 space-y-6" onSubmit={createSchedule}>
            <FormField label="每天可用时间">
              <select
                className={fieldClassName}
                id="dailyMinutes"
                value={assignment.availability.dailyMinutes}
                onChange={(event) =>
                  updateAssignment((current) => ({
                    ...current,
                    availability: {
                      ...current.availability,
                      dailyMinutes: Number(event.target.value),
                    },
                  }))
                }
              >
                <option value={30}>30 分钟</option>
                <option value={60}>60 分钟</option>
                <option value={90}>90 分钟</option>
                <option value={120}>120 分钟</option>
              </select>
            </FormField>

            <FormField label="开始时间">
              <input
                className={fieldClassName}
                id="preferredTime"
                type="time"
                value={assignment.availability.preferredTime}
                onChange={(event) =>
                  updateAssignment((current) => ({
                    ...current,
                    availability: {
                      ...current.availability,
                      preferredTime: event.target.value,
                    },
                  }))
                }
              />
            </FormField>

            <div className="flex justify-end pt-2">
              <button className={primaryButtonClassName} type="submit">
                生成安排
              </button>
            </div>
          </form>
        </div>
      </AppFrame>
    );
  }

  if (!assignment) {
    return (
      <AppFrame {...appFrameProps}>
        <div className="grid min-h-[calc(100dvh-73px)] place-items-center px-6 py-16 text-center">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">
              开始你的作业计划
            </h1>
            <button
              className={`${primaryButtonClassName} mt-8`}
              onClick={openCreate}
              type="button"
            >
              创建作业
            </button>
          </div>
        </div>
      </AppFrame>
    );
  }

  const nextBlock =
    assignment.schedule.find(
      (block) =>
        block.date >= currentDateKey() &&
        taskById.get(block.subtaskId)?.status !== "completed",
    ) ?? null;
  const nextTask = nextBlock ? taskById.get(nextBlock.subtaskId) : null;

  return (
    <AppFrame {...appFrameProps}>
      <div className="mx-auto w-full max-w-4xl py-8 sm:py-12">
        <div className="flex flex-col gap-5 border-b border-slate-200 pb-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-slate-950">
              {assignment.title}
            </h1>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-600">
              <span>截止 {formatDate(assignment.deadline)}</span>
              <span>
                {completedCount} / {assignment.subtasks.length} 完成
              </span>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              className={textButtonClassName}
              onClick={openEditAssignment}
              type="button"
            >
              编辑作业
            </button>
            <button
              className={textButtonClassName}
              onClick={deleteAssignment}
              type="button"
            >
              删除作业
            </button>
          </div>
        </div>

        <div className="mt-6 h-2 overflow-hidden rounded-full bg-slate-200">
          <div
            aria-label={`完成进度 ${progress}%`}
            className="h-full rounded-full bg-indigo-600 transition-[width]"
            style={{ width: `${progress}%` }}
          />
        </div>

        <nav
          aria-label="作业视图"
          className="mt-8 flex gap-1 border-b border-slate-200"
        >
          {(
            [
              ["today", "今天"],
              ["tasks", "任务"],
              ["schedule", "安排"],
            ] as const
          ).map(([view, label]) => (
            <button
              aria-current={dashboardView === view ? "page" : undefined}
              className={`border-b-2 px-4 py-3 font-medium transition focus:ring-2 focus:ring-indigo-200 focus:outline-none ${
                dashboardView === view
                  ? "border-indigo-600 text-indigo-700"
                  : "border-transparent text-slate-500 hover:text-slate-950"
              }`}
              key={view}
              onClick={() => setDashboardView(view)}
              type="button"
            >
              {label}
            </button>
          ))}
        </nav>

        {assignment.unscheduledMinutes > 0 ? (
          <p
            className="mt-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 font-medium text-amber-900"
            role="status"
          >
            截止前还有 {assignment.unscheduledMinutes} 分钟未安排
          </p>
        ) : null}

        {dashboardView === "today" ? (
          <section className="py-8">
            <h2 className="text-xl font-semibold text-slate-950">下一步</h2>
            {nextTask && nextBlock ? (
              <div className="mt-4 rounded-xl border border-slate-200 bg-white p-5 sm:p-6">
                <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h3 className="text-lg font-semibold text-slate-950">
                      {nextTask.title}
                    </h3>
                    <p className="mt-2 text-slate-600">
                      {nextTask.completionCriteria}
                    </p>
                    <p className="mt-3 text-sm text-slate-500">
                      {formatScheduleDate(nextBlock.date)} ·{" "}
                      {nextBlock.startTime} · {nextBlock.durationMinutes} 分钟
                    </p>
                  </div>
                  <button
                    className={primaryButtonClassName}
                    onClick={() => toggleCompleted(nextTask.id)}
                    type="button"
                  >
                    完成任务
                  </button>
                </div>
              </div>
            ) : (
              <p className="mt-4 text-slate-600">当前计划已完成。</p>
            )}
          </section>
        ) : null}

        {dashboardView === "tasks" ? (
          <section className="py-8">
            <div className="flex items-center justify-between gap-4">
              <h2 className="text-xl font-semibold text-slate-950">任务</h2>
              <button
                className={secondaryButtonClassName}
                onClick={() => setScreen("plan")}
                type="button"
              >
                编辑任务计划
              </button>
            </div>
            <ul className="mt-4 divide-y divide-slate-200 border-y border-slate-200">
              {assignment.subtasks.map((subtask) => (
                <li className="flex items-center gap-4 py-4" key={subtask.id}>
                  <input
                    aria-label={`完成 ${subtask.title}`}
                    checked={subtask.status === "completed"}
                    className="size-5 rounded border-slate-300 accent-indigo-600"
                    onChange={() => toggleCompleted(subtask.id)}
                    type="checkbox"
                  />
                  <span
                    className={`min-w-0 flex-1 font-medium ${
                      subtask.status === "completed"
                        ? "text-slate-400 line-through"
                        : "text-slate-900"
                    }`}
                  >
                    {subtask.title}
                  </span>
                  <span className="text-sm text-slate-500">
                    {subtask.estimatedMinutes} 分钟
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {dashboardView === "schedule" ? (
          <section className="py-8">
            <h2 className="text-xl font-semibold text-slate-950">安排</h2>
            {groupedSchedule.length > 0 ? (
              <div className="mt-5 space-y-7">
                {groupedSchedule.map(([date, blocks]) => (
                  <div key={date}>
                    <h3 className="font-semibold text-slate-950">
                      {formatScheduleDate(date)}
                    </h3>
                    <ul className="mt-2 divide-y divide-slate-200 border-y border-slate-200">
                      {blocks.map((block) => {
                        const subtask = taskById.get(block.subtaskId);
                        return (
                          <li
                            className="grid grid-cols-[4.5rem_1fr_auto] gap-3 py-3 text-sm sm:text-base"
                            key={block.id}
                          >
                            <span className="text-slate-500">
                              {block.startTime}
                            </span>
                            <span className="font-medium text-slate-900">
                              {subtask?.title ?? "任务"}
                            </span>
                            <span className="text-slate-500">
                              {block.durationMinutes} 分钟
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-4 text-slate-600">当前没有待安排任务。</p>
            )}
          </section>
        ) : null}
      </div>
    </AppFrame>
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
    <div className="min-h-dvh bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex h-[72px] max-w-5xl items-center justify-between px-5 sm:px-8">
          <span className="text-xl font-semibold tracking-tight text-slate-950">
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
