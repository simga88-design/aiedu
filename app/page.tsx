"use client";

import {
  Bot,
  Check,
  Clock3,
  Copy,
  GitBranch,
  History,
  Lightbulb,
  Loader2,
  MessageSquareText,
  Pencil,
  RefreshCw,
  Send,
  Sparkles,
  Users,
  WandSparkles,
  Workflow,
  Zap
} from "lucide-react";
import Image from "next/image";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  createSeedEvents,
  createSeedIdeas,
  Idea,
  IdeaAction,
  IdeaEvent,
  IdeaEventRow,
  IdeaRow,
  IdeaStage,
  roomId,
  rowToEvent,
  rowToIdea,
  supabase
} from "../lib/realtime-board";

type StageFilter = "all" | IdeaStage;
type ToolMode = "build" | "ai" | "edit" | "history";
type PromptMode = "clarify" | "prototype" | "questions";
type IntentId = "question" | "workflow" | "prototype" | "reflection";

const stageOptions: Array<{ id: StageFilter; label: string }> = [
  { id: "all", label: "전체" },
  { id: "raw", label: "새 생각" },
  { id: "building", label: "발전 중" },
  { id: "tested", label: "실험 완료" }
];

const stageMeta: Record<IdeaStage, { label: string; helper: string }> = {
  raw: { label: "새 생각", helper: "첫 아이디어" },
  building: { label: "발전 중", helper: "누군가 이어 쓰는 중" },
  tested: { label: "실험 완료", helper: "수업에서 확인함" }
};

const actionMeta: Record<IdeaAction, { label: string }> = {
  created: { label: "올림" },
  branched: { label: "이어씀" },
  revised: { label: "수정" },
  tested: { label: "실험" }
};

const promptModes: Array<{ id: PromptMode; label: string; purpose: string }> = [
  { id: "clarify", label: "아이디어 정리", purpose: "핵심을 짧게 정돈" },
  { id: "prototype", label: "도구로 만들기", purpose: "바로 만들 첫 버전 설계" },
  { id: "questions", label: "토론 질문", purpose: "다음 사람이 이어 쓸 질문 생성" }
];

const intentOptions: Array<{
  id: IntentId;
  label: string;
  titlePlaceholder: string;
  bodyPlaceholder: string;
  Icon: typeof Sparkles;
}> = [
  {
    id: "question",
    label: "질문",
    titlePlaceholder: "예: 프롬프트를 잘 쓰는 기준을 비교해보기",
    bodyPlaceholder: "지금 헷갈리는 점이나 같이 확인하고 싶은 질문을 적어 주세요.",
    Icon: MessageSquareText
  },
  {
    id: "workflow",
    label: "업무 자동화",
    titlePlaceholder: "예: 반복 보고서를 자동으로 초안 작성하기",
    bodyPlaceholder: "반복되는 업무, 입력값, 기대 결과를 짧게 적어 주세요.",
    Icon: Workflow
  },
  {
    id: "prototype",
    label: "만들기",
    titlePlaceholder: "예: 수강생 의견을 카드로 정리하는 작은 앱",
    bodyPlaceholder: "누가 쓰고, 무엇을 입력하고, 어떤 결과가 나오면 좋은지 적어 주세요.",
    Icon: Zap
  },
  {
    id: "reflection",
    label: "회고",
    titlePlaceholder: "예: AI가 편했던 순간과 막혔던 순간 비교하기",
    bodyPlaceholder: "수업 중 느낀 점, 어려웠던 점, 다음에 바꿔보고 싶은 점을 적어 주세요.",
    Icon: Lightbulb
  }
];

const localIdeaKey = `ai-class-ideas:${roomId}`;
const localEventKey = `ai-class-events:${roomId}`;

function sortIdeas(ideas: Idea[]) {
  return [...ideas].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );
}

function sortEvents(events: IdeaEvent[]) {
  return [...events].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function cleanName(value: string) {
  return value.trim() || "익명";
}

function makeBranchTitle(parentTitle: string, content: string) {
  const summary = content.trim().replace(/\s+/g, " ").slice(0, 28);
  return summary ? `이어쓰기: ${summary}` : `${parentTitle}에서 이어쓰기`;
}

function createEvent(
  ideaId: string,
  author: string,
  action: IdeaAction,
  content: string
): IdeaEvent {
  return {
    id: crypto.randomUUID(),
    ideaId,
    roomId,
    author: cleanName(author),
    action,
    content,
    createdAt: new Date().toISOString()
  };
}

function getPrompt(mode: PromptMode, idea: Idea | null) {
  if (!idea) {
    return "아이디어를 선택하면 AI에게 바로 붙여넣을 프롬프트가 만들어집니다.";
  }

  const source = [`아이디어 제목: ${idea.title}`, `현재 내용: ${idea.content}`].join("\n");

  if (mode === "prototype") {
    return [
      "다음 아이디어를 AI 교육 시간에 바로 보여줄 수 있는 작은 웹 도구 콘셉트로 바꿔줘.",
      source,
      "",
      "출력은 화면 구성, 입력값, 결과 예시, 10분 안에 만들 첫 버전 순서로 짧게 정리해줘."
    ].join("\n");
  }

  if (mode === "questions") {
    return [
      "다음 아이디어를 다른 수강생들이 더 쉽게 이어 쓸 수 있도록 토론 질문으로 바꿔줘.",
      source,
      "",
      "출력은 바로 답할 수 있는 질문 5개와, 각 질문이 아이디어를 어떻게 발전시키는지 한 줄씩 정리해줘."
    ].join("\n");
  }

  return [
    "다음 아이디어를 수업에서 바로 실험할 수 있게 다듬어줘.",
    source,
    "",
    "출력은 핵심 문제, 대상 사용자, 좋은 점, 부족한 점, 10분 실험 방법, 다음 사람이 이어 쓸 질문 순서로 정리해줘."
  ].join("\n");
}

export default function Home() {
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [events, setEvents] = useState<IdeaEvent[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [stageFilter, setStageFilter] = useState<StageFilter>("all");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [intent, setIntent] = useState<IntentId>("question");
  const [author, setAuthor] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [newContent, setNewContent] = useState("");
  const [branchContent, setBranchContent] = useState("");
  const [editIdeaId, setEditIdeaId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editContent, setEditContent] = useState("");
  const [toolMode, setToolMode] = useState<ToolMode>("build");
  const [promptMode, setPromptMode] = useState<PromptMode>("clarify");

  const selectedIdea = useMemo(
    () => ideas.find((idea) => idea.id === selectedId) ?? ideas[0] ?? null,
    [ideas, selectedId]
  );

  const filteredIdeas = useMemo(() => {
    if (stageFilter === "all") {
      return ideas;
    }

    return ideas.filter((idea) => idea.stage === stageFilter);
  }, [ideas, stageFilter]);

  const relatedEvents = useMemo(() => {
    if (!selectedIdea) {
      return [];
    }

    return sortEvents(events.filter((event) => event.ideaId === selectedIdea.id));
  }, [events, selectedIdea]);

  const branchCounts = useMemo(() => {
    return ideas.reduce<Record<string, number>>((counts, idea) => {
      if (idea.parentId) {
        counts[idea.parentId] = (counts[idea.parentId] ?? 0) + 1;
      }

      return counts;
    }, {});
  }, [ideas]);

  const stats = useMemo(
    () => ({
      ideas: ideas.length,
      building: ideas.filter((idea) => idea.stage === "building").length,
      actions: events.length
    }),
    [events.length, ideas]
  );

  const aiPrompt = useMemo(() => getPrompt(promptMode, selectedIdea), [promptMode, selectedIdea]);

  const activeIntent = useMemo(
    () => intentOptions.find((option) => option.id === intent) ?? intentOptions[0],
    [intent]
  );

  const activePromptMode = useMemo(
    () => promptModes.find((mode) => mode.id === promptMode) ?? promptModes[0],
    [promptMode]
  );

  const editDraft = useMemo(
    () => ({
      title: selectedIdea ? (editIdeaId === selectedIdea.id ? editTitle : selectedIdea.title) : "",
      content: selectedIdea
        ? editIdeaId === selectedIdea.id
          ? editContent
          : selectedIdea.content
        : ""
    }),
    [editContent, editIdeaId, editTitle, selectedIdea]
  );

  const persistLocal = useCallback((nextIdeas: Idea[], nextEvents: IdeaEvent[]) => {
    window.localStorage.setItem(localIdeaKey, JSON.stringify(nextIdeas));
    window.localStorage.setItem(localEventKey, JSON.stringify(nextEvents));
    setIdeas(sortIdeas(nextIdeas));
    setEvents(sortEvents(nextEvents));
  }, []);

  const loadLocal = useCallback(() => {
    try {
      const savedIdeas = window.localStorage.getItem(localIdeaKey);
      const savedEvents = window.localStorage.getItem(localEventKey);
      const nextIdeas = savedIdeas ? (JSON.parse(savedIdeas) as Idea[]) : createSeedIdeas();
      const nextEvents = savedEvents ? (JSON.parse(savedEvents) as IdeaEvent[]) : createSeedEvents();

      persistLocal(nextIdeas, nextEvents);
      setSelectedId((current) => current ?? nextIdeas[0]?.id ?? null);
    } catch {
      const seedIdeas = createSeedIdeas();
      const seedEvents = createSeedEvents();

      persistLocal(seedIdeas, seedEvents);
      setSelectedId(seedIdeas[0]?.id ?? null);
    }
  }, [persistLocal]);

  const refreshData = useCallback(
    async (quiet = false) => {
      if (!quiet) {
        setIsLoading(true);
      }

      if (!supabase) {
        loadLocal();
        setIsLoading(false);
        return;
      }

      try {
        const [ideasResult, eventsResult] = await Promise.all([
          supabase
            .from("class_ideas")
            .select("*")
            .eq("room_id", roomId)
            .order("updated_at", { ascending: false }),
          supabase
            .from("class_idea_events")
            .select("*")
            .eq("room_id", roomId)
            .order("created_at", { ascending: false })
        ]);

        if (ideasResult.error) {
          throw ideasResult.error;
        }

        if (eventsResult.error) {
          throw eventsResult.error;
        }

        const nextIdeas = (ideasResult.data as IdeaRow[]).map(rowToIdea);
        const nextEvents = (eventsResult.data as IdeaEventRow[]).map(rowToEvent);

        setIdeas(sortIdeas(nextIdeas));
        setEvents(sortEvents(nextEvents));
        setSelectedId((current) =>
          current && nextIdeas.some((idea) => idea.id === current)
            ? current
            : nextIdeas[0]?.id ?? null
        );
        setNotice("");
      } catch {
        setNotice("공유 연결을 확인해 주세요. 연결 전에는 다른 사람 화면에 반영되지 않을 수 있습니다.");
        loadLocal();
      } finally {
        if (!quiet) {
          setIsLoading(false);
        }
      }
    },
    [loadLocal]
  );

  useEffect(() => {
    const loadTimer = window.setTimeout(() => {
      void refreshData();
    }, 0);

    if (!supabase) {
      return () => window.clearTimeout(loadTimer);
    }

    const activeSupabase = supabase;
    const channel = activeSupabase
      .channel(`class-room:${roomId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "class_ideas", filter: `room_id=eq.${roomId}` },
        () => {
          void refreshData(true);
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "class_idea_events",
          filter: `room_id=eq.${roomId}`
        },
        () => {
          void refreshData(true);
        }
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          void refreshData(true);
        }
      });

    return () => {
      window.clearTimeout(loadTimer);
      void activeSupabase.removeChannel(channel);
    };
  }, [refreshData]);

  async function addEvent(event: IdeaEvent) {
    if (!supabase) {
      return;
    }

    const { error } = await supabase.from("class_idea_events").insert({
      idea_id: event.ideaId,
      room_id: event.roomId,
      author: event.author,
      action: event.action,
      content: event.content
    });

    if (error) {
      throw error;
    }
  }

  async function handleCreateIdea(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!newTitle.trim() || !newContent.trim()) {
      setNotice("제목과 내용을 함께 적어 주세요.");
      return;
    }

    setIsSaving(true);
    const now = new Date().toISOString();
    const writer = cleanName(author);

    try {
      if (supabase) {
        const { data, error } = await supabase
          .from("class_ideas")
          .insert({
            room_id: roomId,
            author: writer,
            title: newTitle.trim(),
            content: newContent.trim(),
            stage: "raw"
          })
          .select("*")
          .single();

        if (error) {
          throw error;
        }

        const createdIdea = rowToIdea(data as IdeaRow);
        await addEvent(createEvent(createdIdea.id, writer, "created", "새 아이디어를 올렸습니다."));
        setSelectedId(createdIdea.id);
        setToolMode("build");
        await refreshData(true);
      } else {
        const createdIdea: Idea = {
          id: crypto.randomUUID(),
          roomId,
          author: writer,
          title: newTitle.trim(),
          content: newContent.trim(),
          stage: "raw",
          parentId: null,
          createdAt: now,
          updatedAt: now
        };
        const createdEvent = createEvent(createdIdea.id, writer, "created", "새 아이디어를 올렸습니다.");

        persistLocal([createdIdea, ...ideas], [createdEvent, ...events]);
        setSelectedId(createdIdea.id);
        setToolMode("build");
      }

      setNewTitle("");
      setNewContent("");
      setNotice("아이디어가 보드에 올라갔습니다.");
    } catch {
      setNotice("아이디어를 저장하지 못했습니다. 연결 상태를 확인해 주세요.");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleBranchIdea(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedIdea || !branchContent.trim()) {
      setNotice("이어 쓸 내용을 적어 주세요.");
      return;
    }

    setIsSaving(true);
    const now = new Date().toISOString();
    const writer = cleanName(author);
    const branchTitle = makeBranchTitle(selectedIdea.title, branchContent);

    try {
      if (supabase) {
        const { data, error } = await supabase
          .from("class_ideas")
          .insert({
            room_id: roomId,
            author: writer,
            title: branchTitle,
            content: branchContent.trim(),
            stage: "building",
            parent_id: selectedIdea.id
          })
          .select("*")
          .single();

        if (error) {
          throw error;
        }

        const branchedIdea = rowToIdea(data as IdeaRow);
        await addEvent(
          createEvent(branchedIdea.id, writer, "branched", `${selectedIdea.title}에서 이어 썼습니다.`)
        );
        setSelectedId(branchedIdea.id);
        await refreshData(true);
      } else {
        const branchedIdea: Idea = {
          id: crypto.randomUUID(),
          roomId,
          author: writer,
          title: branchTitle,
          content: branchContent.trim(),
          stage: "building",
          parentId: selectedIdea.id,
          createdAt: now,
          updatedAt: now
        };
        const branchEvent = createEvent(
          branchedIdea.id,
          writer,
          "branched",
          `${selectedIdea.title}에서 이어 썼습니다.`
        );

        persistLocal([branchedIdea, ...ideas], [branchEvent, ...events]);
        setSelectedId(branchedIdea.id);
      }

      setBranchContent("");
      setNotice("좋아요. 새 가지가 만들어졌습니다.");
    } catch {
      setNotice("이어 쓴 내용을 저장하지 못했습니다.");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleReviseIdea(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const nextTitle = editDraft.title.trim();
    const nextContent = editDraft.content.trim();

    if (!selectedIdea || !nextTitle || !nextContent) {
      setNotice("수정할 제목과 내용을 확인해 주세요.");
      return;
    }

    setIsSaving(true);
    const now = new Date().toISOString();
    const writer = cleanName(author);

    try {
      if (supabase) {
        const { error } = await supabase
          .from("class_ideas")
          .update({
            title: nextTitle,
            content: nextContent,
            stage: "building",
            updated_at: now
          })
          .eq("id", selectedIdea.id);

        if (error) {
          throw error;
        }

        await addEvent(createEvent(selectedIdea.id, writer, "revised", "아이디어를 함께 수정했습니다."));
        await refreshData(true);
      } else {
        const nextIdeas = ideas.map((idea) =>
          idea.id === selectedIdea.id
            ? {
                ...idea,
                title: nextTitle,
                content: nextContent,
                stage: "building" as IdeaStage,
                updatedAt: now
              }
            : idea
        );
        const revisedEvent = createEvent(selectedIdea.id, writer, "revised", "아이디어를 함께 수정했습니다.");

        persistLocal(nextIdeas, [revisedEvent, ...events]);
      }

      setNotice("수정 내용이 저장됐습니다.");
      setEditIdeaId(selectedIdea.id);
      setEditTitle(nextTitle);
      setEditContent(nextContent);
    } catch {
      setNotice("수정 내용을 저장하지 못했습니다.");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleMarkTested() {
    if (!selectedIdea) {
      return;
    }

    setIsSaving(true);
    const now = new Date().toISOString();
    const writer = cleanName(author);

    try {
      if (supabase) {
        const { error } = await supabase
          .from("class_ideas")
          .update({ stage: "tested", updated_at: now })
          .eq("id", selectedIdea.id);

        if (error) {
          throw error;
        }

        await addEvent(createEvent(selectedIdea.id, writer, "tested", "수업에서 실험해 본 아이디어로 표시했습니다."));
        await refreshData(true);
      } else {
        const nextIdeas = ideas.map((idea) =>
          idea.id === selectedIdea.id
            ? {
                ...idea,
                stage: "tested" as IdeaStage,
                updatedAt: now
              }
            : idea
        );
        const testedEvent = createEvent(selectedIdea.id, writer, "tested", "수업에서 실험해 본 아이디어로 표시했습니다.");

        persistLocal(nextIdeas, [testedEvent, ...events]);
      }

      setNotice("실험 완료로 표시했습니다.");
    } catch {
      setNotice("상태를 바꾸지 못했습니다.");
    } finally {
      setIsSaving(false);
    }
  }

  async function copyPrompt() {
    try {
      await navigator.clipboard.writeText(aiPrompt);
      setNotice("AI 프롬프트를 복사했습니다.");
    } catch {
      setNotice("복사 권한이 막혀 있습니다. 프롬프트를 직접 선택해 복사해 주세요.");
    }
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">
            <Sparkles size={20} />
          </span>
          <div>
            <strong>AI 교육 캔버스</strong>
          </div>
        </div>

        <div className="top-actions">
          <button className="icon-button" onClick={() => void refreshData()} type="button" title="새로고침">
            <RefreshCw size={17} />
          </button>
        </div>
      </header>

      {notice ? (
        <div className="status-toast" role="status" aria-live="polite">
          {notice}
        </div>
      ) : null}

      <main className="workspace">
        <section className="compose-panel" aria-label="새 아이디어 작성">
          <div className="compose-content">
            <div className="compose-heading">
              <div>
                <span className="section-kicker">Step 1</span>
                <h1>내 생각 올리기</h1>
              </div>
            </div>

            <div className="intent-strip" aria-label="아이디어 유형 선택">
              {intentOptions.map(({ Icon, id, label }) => (
                <button
                  aria-pressed={intent === id}
                  className={intent === id ? "intent-chip is-active" : "intent-chip"}
                  key={id}
                  onClick={() => setIntent(id)}
                  type="button"
                >
                  <Icon size={16} />
                  {label}
                </button>
              ))}
            </div>

            <form className="quick-form" onSubmit={handleCreateIdea}>
              <label>
                <span>이름</span>
                <input
                  value={author}
                  onChange={(event) => setAuthor(event.target.value)}
                  maxLength={18}
                  placeholder="익명"
                />
              </label>
              <label className="title-field">
                <span>한 줄 생각</span>
                <input
                  value={newTitle}
                  onChange={(event) => setNewTitle(event.target.value)}
                  maxLength={70}
                  placeholder={activeIntent.titlePlaceholder}
                />
              </label>
              <label className="body-field">
                <span>조금 더 적기</span>
                <textarea
                  value={newContent}
                  onChange={(event) => setNewContent(event.target.value)}
                  maxLength={280}
                  placeholder={activeIntent.bodyPlaceholder}
                />
              </label>
              <button className="primary-button" disabled={isSaving} type="submit">
                {isSaving ? <Loader2 className="spin" size={18} /> : <Send size={18} />}
                올리기
              </button>
            </form>
          </div>

          <div className="compose-visual" aria-hidden="true">
            <Image
              src="/assets/vibe-workshop.png"
              alt=""
              fill
              priority
              quality={100}
              sizes="(max-width: 760px) 0px, (max-width: 1180px) 100vw, 520px"
            />
            <span className="visual-chip visual-chip--top">Live</span>
            <span className="visual-chip visual-chip--bottom">AI Lab</span>
          </div>

        </section>

        <section className="board-area" aria-label="실시간 아이디어 보드">
          <div className="board-header">
            <div>
              <span className="section-kicker">Step 2</span>
              <h2>함께 보는 아이디어</h2>
            </div>
            <div className="board-controls">
              <div className="metric-strip" aria-label="보드 현황">
                <span>{stats.ideas}개 아이디어</span>
                <span>{stats.building}개 발전 중</span>
                <span>{stats.actions}번 수정</span>
              </div>
              <div className="segmented" aria-label="아이디어 상태 필터">
                {stageOptions.map((option) => (
                  <button
                    className={stageFilter === option.id ? "is-active" : ""}
                    key={option.id}
                    onClick={() => setStageFilter(option.id)}
                    type="button"
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {isLoading ? (
            <div className="state-message">
              <Loader2 className="spin" size={24} />
              보드를 불러오는 중입니다.
            </div>
          ) : filteredIdeas.length ? (
            <div className="idea-grid">
              {filteredIdeas.map((idea) => (
                <article
                  className={`idea-card idea-card--${idea.stage} ${
                    selectedIdea?.id === idea.id ? "is-selected" : ""
                  }`}
                  key={idea.id}
                >
                  <button
                    aria-label={`${idea.title} 열기`}
                    className="idea-card-button"
                    onClick={() => {
                      setSelectedId(idea.id);
                      setToolMode("build");
                    }}
                    type="button"
                  >
                    <div className="card-meta">
                      <span>{stageMeta[idea.stage].label}</span>
                      <time>{formatTime(idea.updatedAt)}</time>
                    </div>
                    <h3>{idea.title}</h3>
                    <p>{idea.content}</p>
                    <div className="card-footer">
                      <span>
                        <Users size={14} />
                        {idea.author}
                      </span>
                      <span>
                        <GitBranch size={14} />
                        {branchCounts[idea.id] ?? 0}
                      </span>
                    </div>
                  </button>
                </article>
              ))}
            </div>
          ) : (
            <div className="state-message">
              <WandSparkles size={24} />
              아직 아이디어가 없습니다. 첫 생각을 올려 주세요.
            </div>
          )}
        </section>

        <aside className="focus-panel" aria-label="선택한 아이디어 작업">
          <div className="focus-region-header">
            <span className="section-kicker">Step 3</span>
            <h2>선택해서 발전시키기</h2>
          </div>

          {selectedIdea ? (
            <>
              <div className="focus-summary">
                <span className={`stage-badge stage-badge--${selectedIdea.stage}`}>
                  {stageMeta[selectedIdea.stage].label}
                </span>
                <h2>{selectedIdea.title}</h2>
                <p>{selectedIdea.content}</p>
                <div className="focus-meta">
                  <span>
                    <Users size={14} />
                    {selectedIdea.author}
                  </span>
                  <span>
                    <Clock3 size={14} />
                    {formatTime(selectedIdea.updatedAt)}
                  </span>
                </div>
              </div>

              <div className="tool-tabs" aria-label="아이디어 작업 선택">
                <button
                  className={toolMode === "build" ? "is-active" : ""}
                  onClick={() => setToolMode("build")}
                  type="button"
                >
                  <GitBranch size={16} />
                  이어쓰기
                </button>
                <button
                  className={toolMode === "ai" ? "is-active" : ""}
                  onClick={() => setToolMode("ai")}
                  type="button"
                >
                  <Bot size={16} />
                  AI 정리
                </button>
                <button
                  className={toolMode === "edit" ? "is-active" : ""}
                  onClick={() => setToolMode("edit")}
                  type="button"
                >
                  <Pencil size={16} />
                  수정
                </button>
                <button
                  className={toolMode === "history" ? "is-active" : ""}
                  onClick={() => setToolMode("history")}
                  type="button"
                >
                  <History size={16} />
                  과정
                </button>
              </div>

              <div className="tool-body">
                {toolMode === "build" ? (
                  <form className="stack-form" onSubmit={handleBranchIdea}>
                    <label>
                      <span>이 생각에 이어서</span>
                      <textarea
                        value={branchContent}
                        onChange={(event) => setBranchContent(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.stopPropagation();
                          }
                        }}
                        maxLength={260}
                        placeholder="더 좋은 방향, 다른 활용 장면, 걱정되는 점을 적어 주세요."
                      />
                    </label>
                    <button className="primary-button" disabled={isSaving} type="submit">
                      <GitBranch size={18} />
                      이어쓰기
                    </button>
                  </form>
                ) : null}

                {toolMode === "ai" ? (
                  <div className="ai-tool">
                    <div className="ai-brief">
                      <span>
                        <Bot size={16} />
                        AI 보조 목적
                      </span>
                      <strong>{activePromptMode.purpose}</strong>
                    </div>
                    <div className="segmented segmented--wide" aria-label="AI 프롬프트 유형">
                      {promptModes.map((mode) => (
                        <button
                          className={promptMode === mode.id ? "is-active" : ""}
                          key={mode.id}
                          onClick={() => setPromptMode(mode.id)}
                          type="button"
                        >
                          {mode.label}
                        </button>
                      ))}
                    </div>
                    <pre>{aiPrompt}</pre>
                    <button className="secondary-button" onClick={() => void copyPrompt()} type="button">
                      <Copy size={18} />
                      프롬프트 복사
                    </button>
                  </div>
                ) : null}

                {toolMode === "edit" ? (
                  <form className="stack-form" onSubmit={handleReviseIdea}>
                    <label>
                      <span>제목</span>
                      <input
                        value={editDraft.title}
                        onChange={(event) => {
                          setEditIdeaId(selectedIdea.id);
                          setEditTitle(event.target.value);
                        }}
                        maxLength={70}
                      />
                    </label>
                    <label>
                      <span>내용</span>
                      <textarea
                        value={editDraft.content}
                        onChange={(event) => {
                          setEditIdeaId(selectedIdea.id);
                          setEditContent(event.target.value);
                        }}
                        maxLength={320}
                      />
                    </label>
                    <div className="split-actions">
                      <button className="primary-button" disabled={isSaving} type="submit">
                        <Pencil size={18} />
                        저장
                      </button>
                      <button
                        className="secondary-button"
                        disabled={isSaving}
                        onClick={handleMarkTested}
                        type="button"
                      >
                        <Check size={18} />
                        실험 완료
                      </button>
                    </div>
                  </form>
                ) : null}

                {toolMode === "history" ? (
                  <div className="timeline">
                    {relatedEvents.length ? (
                      relatedEvents.map((event) => (
                        <article key={event.id}>
                          <span>{actionMeta[event.action].label}</span>
                          <p>{event.content}</p>
                          <small>
                            {event.author} · {formatTime(event.createdAt)}
                          </small>
                        </article>
                      ))
                    ) : (
                      <p className="quiet-text">아직 기록이 없습니다.</p>
                    )}
                  </div>
                ) : null}
              </div>
            </>
          ) : (
            <div className="state-message">
              <Sparkles size={24} />
              아이디어를 선택하면 이어쓰기와 AI 다듬기를 시작할 수 있습니다.
            </div>
          )}
        </aside>
      </main>
    </div>
  );
}
