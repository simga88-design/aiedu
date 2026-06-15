import { createClient } from "@supabase/supabase-js";

export type IdeaStage = "raw" | "building" | "tested";
export type IdeaAction = "created" | "branched" | "revised" | "tested";

export type Idea = {
  id: string;
  roomId: string;
  author: string;
  title: string;
  content: string;
  stage: IdeaStage;
  parentId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type IdeaEvent = {
  id: string;
  ideaId: string;
  roomId: string;
  author: string;
  action: IdeaAction;
  content: string;
  createdAt: string;
};

export type IdeaRow = {
  id: string;
  room_id: string;
  author: string;
  title: string;
  content: string;
  stage: IdeaStage;
  parent_id: string | null;
  created_at: string;
  updated_at: string;
};

export type IdeaEventRow = {
  id: string;
  idea_id: string;
  room_id: string;
  author: string;
  action: IdeaAction;
  content: string;
  created_at: string;
};

export const roomId = process.env.NEXT_PUBLIC_CLASS_ROOM_ID ?? "ai-class-live";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl as string, supabaseAnonKey as string, {
      realtime: {
        params: {
          eventsPerSecond: 10
        }
      }
    })
  : null;

export function rowToIdea(row: IdeaRow): Idea {
  return {
    id: row.id,
    roomId: row.room_id,
    author: row.author,
    title: row.title,
    content: row.content,
    stage: row.stage,
    parentId: row.parent_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export function rowToEvent(row: IdeaEventRow): IdeaEvent {
  return {
    id: row.id,
    ideaId: row.idea_id,
    roomId: row.room_id,
    author: row.author,
    action: row.action,
    content: row.content,
    createdAt: row.created_at
  };
}

export function createSeedIdeas(currentRoomId = roomId): Idea[] {
  const now = Date.now();

  return [
    {
      id: "seed-1",
      roomId: currentRoomId,
      author: "민지",
      title: "프롬프트 전후 비교를 한 화면에 보여주기",
      content:
        "같은 요청도 표현을 바꾸면 결과가 어떻게 달라지는지 바로 비교하면 바이브코딩이 훨씬 쉽게 느껴질 것 같습니다.",
      stage: "building",
      parentId: null,
      createdAt: new Date(now - 1000 * 60 * 18).toISOString(),
      updatedAt: new Date(now - 1000 * 60 * 8).toISOString()
    },
    {
      id: "seed-2",
      roomId: currentRoomId,
      author: "현우",
      title: "내 업무를 자동화 아이디어로 바꿔보기",
      content:
        "각자 반복해서 하는 일을 하나 적고, AI가 입력값과 결과물을 정리해 주면 실습으로 연결하기 좋겠습니다.",
      stage: "raw",
      parentId: null,
      createdAt: new Date(now - 1000 * 60 * 15).toISOString(),
      updatedAt: new Date(now - 1000 * 60 * 15).toISOString()
    },
    {
      id: "seed-3",
      roomId: currentRoomId,
      author: "서연",
      title: "수강생 질문을 기능 목록으로 바꾸기",
      content:
        "수업 중 나온 질문을 모아 AI에게 기능 목록으로 정리시키고, 그중 하나를 바로 만들어 보면 참여도가 높을 것 같습니다.",
      stage: "tested",
      parentId: null,
      createdAt: new Date(now - 1000 * 60 * 25).toISOString(),
      updatedAt: new Date(now - 1000 * 60 * 4).toISOString()
    }
  ];
}

export function createSeedEvents(currentRoomId = roomId): IdeaEvent[] {
  const now = Date.now();

  return [
    {
      id: "event-1",
      ideaId: "seed-1",
      roomId: currentRoomId,
      author: "민지",
      action: "created",
      content: "새 아이디어를 올렸습니다.",
      createdAt: new Date(now - 1000 * 60 * 18).toISOString()
    },
    {
      id: "event-2",
      ideaId: "seed-1",
      roomId: currentRoomId,
      author: "강사",
      action: "revised",
      content: "비교 장면이 더 잘 보이도록 제목을 정리했습니다.",
      createdAt: new Date(now - 1000 * 60 * 8).toISOString()
    },
    {
      id: "event-3",
      ideaId: "seed-2",
      roomId: currentRoomId,
      author: "현우",
      action: "created",
      content: "업무 자동화 실습 아이디어를 올렸습니다.",
      createdAt: new Date(now - 1000 * 60 * 15).toISOString()
    },
    {
      id: "event-4",
      ideaId: "seed-3",
      roomId: currentRoomId,
      author: "서연",
      action: "tested",
      content: "수업 질문을 기능 목록으로 바꾸는 흐름까지 실험했습니다.",
      createdAt: new Date(now - 1000 * 60 * 4).toISOString()
    }
  ];
}
