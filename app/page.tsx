"use client";

import {
  Bot,
  Braces,
  ChevronDown,
  ChevronUp,
  Check,
  Clock3,
  Copy,
  FileText,
  GitBranch,
  Heart,
  History,
  Lightbulb,
  Loader2,
  MessageSquareText,
  Pencil,
  Presentation,
  RefreshCw,
  SearchCheck,
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
  IdeaComment,
  IdeaCommentRow,
  IdeaEvent,
  IdeaEventRow,
  IdeaLike,
  IdeaLikeRow,
  IdeaRow,
  IdeaStage,
  roomId,
  rowToComment,
  rowToEvent,
  rowToIdea,
  rowToLike,
  supabase
} from "../lib/realtime-board";

type StageFilter = "all" | IdeaStage;
type ToolMode = "build" | "comments" | "ai" | "edit" | "history";
type PromptMode = "clarify" | "prototype" | "questions";
type PromptCategory = "all" | "document" | "record" | "planning" | "guide" | "review" | "automation";
type AppView = "mission" | "prompts" | "board" | "check";
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

const promptCategories: Array<{ id: PromptCategory; label: string }> = [
  { id: "all", label: "전체" },
  { id: "document", label: "문서" },
  { id: "record", label: "기록" },
  { id: "planning", label: "기획" },
  { id: "guide", label: "안내" },
  { id: "review", label: "검토" },
  { id: "automation", label: "자동화" }
];

const appViews: Array<{
  id: AppView;
  label: string;
  title: string;
  description: string;
  Icon: typeof Sparkles;
}> = [
  {
    id: "mission",
    label: "오늘의 실습",
    title: "오늘 할 일을 순서대로 따라가기",
    description: "프롬프트를 써보고, 결과를 다듬고, 좋은 아이디어를 보드에 공유하는 수업 흐름입니다.",
    Icon: Sparkles
  },
  {
    id: "prompts",
    label: "프롬프트 키트",
    title: "복사해서 바로 실험하기",
    description: "실무형 프롬프트와 후속 프롬프트를 골라 AI에게 바로 붙여넣을 수 있습니다.",
    Icon: Copy
  },
  {
    id: "board",
    label: "아이디어 보드",
    title: "생각을 올리고 함께 발전시키기",
    description: "수강생들이 낸 아이디어를 실시간으로 보고, 이어 쓰고, 수정하고, AI로 정리합니다.",
    Icon: Users
  },
  {
    id: "check",
    label: "AI 사용 체크",
    title: "그대로 쓰기 전에 확인하기",
    description: "개인정보, 사실관계, 표현 적절성처럼 AI 결과물을 쓰기 전 꼭 확인할 기준입니다.",
    Icon: Check
  }
];

const missionSteps: Array<{
  step: string;
  title: string;
  body: string;
  action: string;
  target: AppView;
  Icon: typeof Sparkles;
}> = [
  {
    step: "1",
    title: "프롬프트 하나 고르기",
    body: "내 업무나 관심사에 가장 가까운 예제를 골라 AI에게 붙여넣습니다.",
    action: "프롬프트 보기",
    target: "prompts",
    Icon: Copy
  },
  {
    step: "2",
    title: "결과에서 아쉬운 점 찾기",
    body: "AI가 잘한 점보다 빠진 정보, 위험한 표현, 애매한 부분을 먼저 찾습니다.",
    action: "체크 기준 보기",
    target: "check",
    Icon: SearchCheck
  },
  {
    step: "3",
    title: "후속 프롬프트로 개선하기",
    body: "처음 답변을 끝으로 보지 말고, 후속 보기로 한 번 더 다듬습니다.",
    action: "후속 실험하기",
    target: "prompts",
    Icon: WandSparkles
  },
  {
    step: "4",
    title: "좋은 아이디어 공유하기",
    body: "실험하면서 떠오른 활용 아이디어를 보드에 올려 다른 수강생과 나눕니다.",
    action: "보드로 이동",
    target: "board",
    Icon: Send
  },
  {
    step: "5",
    title: "다른 생각에 이어쓰기",
    body: "다른 사람의 아이디어에 활용 장면, 우려점, 개선 방향을 덧붙입니다.",
    action: "아이디어 보기",
    target: "board",
    Icon: GitBranch
  }
];

const safetyChecks: Array<{
  title: string;
  body: string;
  bad: string;
  better: string;
}> = [
  {
    title: "개인정보 먼저 빼기",
    body: "이름, 연락처, 주소, 주민번호, 구체적 사례 정보는 AI에 넣기 전에 비식별 처리합니다.",
    bad: "김OO님의 주소와 상담 내용을 그대로 붙여넣기",
    better: "[비식별 대상자]의 가상 상담 메모로 바꿔 입력하기"
  },
  {
    title: "없는 정보 만들지 않기",
    body: "날짜, 담당자, 법령, 통계처럼 확인이 필요한 값은 AI가 추측하지 못하게 조건을 줍니다.",
    bad: "정확한 날짜가 없는데 자연스럽게 완성해줘",
    better: "모르는 내용은 [확인 필요]로 표시해줘"
  },
  {
    title: "표현의 온도 확인하기",
    body: "낙인, 시혜, 단정처럼 보이는 표현은 현장 문서에서 특히 조심해야 합니다.",
    bad: "불쌍한 대상자, 정상적인 생활, 관리 대상",
    better: "지원이 필요한 주민, 일상 회복, 지속적인 상담 지원"
  },
  {
    title: "최종 판단은 사람이 하기",
    body: "AI 결과물은 초안입니다. 현장 맥락, 기관 기준, 법적 책임은 사람이 확인합니다.",
    bad: "AI가 쓴 문장을 그대로 공문/기록에 붙여넣기",
    better: "초안으로 사용하고 사실관계와 표현을 검토한 뒤 반영하기"
  }
];

function isAppView(value: string): value is AppView {
  return appViews.some((view) => view.id === value);
}

const promptExamples: Array<{
  category: Exclude<PromptCategory, "all">;
  title: string;
  purpose: string;
  teachingPoint: string;
  prompt: string;
  followUpPrompt: string;
  Icon: typeof Sparkles;
}> = [
  {
    category: "document",
    title: "업무 메모를 공문 초안으로",
    purpose: "흩어진 메모가 조건을 만나면 바로 다듬을 수 있는 문서 초안이 된다는 걸 보여줍니다.",
    teachingPoint: "없는 내용은 만들지 말고 [확인 필요]로 표시하게 하는 습관이 핵심입니다.",
    Icon: FileText,
    prompt: [
      "너는 공공기관·사회복지기관 행정 실무를 잘 아는 문서 작성 보조자야.",
      "아래 메모를 바탕으로 유관기관에 보낼 협조 요청 공문 초안을 작성해줘.",
      "",
      "조건",
      "1. 문체는 정중하고 간결한 공문 스타일로 작성해줘.",
      "2. 제목, 수신, 본문, 협조 요청사항, 회신 방법, 문의처 순서로 정리해줘.",
      "3. 메모에 없는 날짜, 담당자, 연락처는 임의로 만들지 말고 [확인 필요]라고 표시해줘.",
      "4. 개인정보나 민감정보가 들어갈 만한 부분은 넣지 말고 주의 문구를 남겨줘.",
      "5. 실제 제출 전 사람이 확인해야 할 항목을 마지막에 체크리스트로 정리해줘.",
      "",
      "메모",
      "[여기에 회의 메모나 업무 메모를 붙여넣기]"
    ].join("\n"),
    followUpPrompt: [
      "방금 작성한 공문 초안을 더 자연스럽게 다듬어줘.",
      "단, 사실관계는 바꾸지 말고 문장이 길거나 모호한 부분만 줄여줘.",
      "수정한 이유를 항목별로 짧게 설명해줘."
    ].join("\n")
  },
  {
    category: "record",
    title: "상담 메모를 기록 초안으로",
    purpose: "AI가 판단을 대신하는 것이 아니라, 가상 메모를 기록 양식으로 구조화하는 보조자라는 점을 체감시킵니다.",
    teachingPoint: "사실, 추정, 계획을 분리하고 개인정보는 교육용 가상정보만 쓰게 해야 합니다.",
    Icon: Workflow,
    prompt: [
      "너는 사회복지 현장 기록 정리를 돕는 보조자야.",
      "아래 상담 메모를 사례기록 초안으로 정리해줘.",
      "",
      "중요 조건",
      "1. 교육용 가상 사례로만 다뤄줘.",
      "2. 이름, 연락처, 주소, 주민번호 등 개인정보는 모두 [비식별 처리]로 표시해줘.",
      "3. 관찰된 사실, 내담자 표현, 실무자 판단, 향후 계획을 분리해줘.",
      "4. 단정적이거나 낙인처럼 보일 수 있는 표현은 중립적으로 바꿔줘.",
      "5. 마지막에는 사람이 반드시 확인해야 할 위험 요소와 추가 질문을 적어줘.",
      "",
      "상담 메모",
      "[여기에 가상 상담 메모를 붙여넣기]"
    ].join("\n"),
    followUpPrompt: [
      "이 기록 초안에서 윤리적으로 조심해야 할 표현을 찾아줘.",
      "문제 표현, 왜 위험한지, 대체 표현을 표로 정리해줘."
    ].join("\n")
  },
  {
    category: "planning",
    title: "아이디어를 사업계획서 뼈대로",
    purpose: "한 줄 아이디어가 목적, 대상, 운영 방식, 기대효과를 가진 기획 초안으로 확장되는 장면을 보여줍니다.",
    teachingPoint: "AI는 완성된 계획서를 대신 쓰는 도구가 아니라 막막한 첫 구조를 잡아주는 도구라는 메시지가 좋습니다.",
    Icon: Presentation,
    prompt: [
      "너는 사회복지 프로그램 기획을 돕는 실무 코치야.",
      "아래 아이디어를 사업계획서 초안 구조로 확장해줘.",
      "",
      "출력 형식",
      "1. 사업명 후보 3개",
      "2. 추진 배경과 필요성",
      "3. 대상자와 선정 기준",
      "4. 프로그램 목표",
      "5. 세부 운영 내용",
      "6. 필요한 자원과 협력기관",
      "7. 기대효과",
      "8. 평가 방법",
      "9. 아직 확인해야 할 정보",
      "",
      "조건",
      "- 과장된 효과는 피하고 현실적인 수준으로 써줘.",
      "- 예산, 인원, 일정처럼 모르는 값은 [확인 필요]로 표시해줘.",
      "- 초안은 바로 수정하기 쉽게 항목별 bullet로 작성해줘.",
      "",
      "아이디어",
      "[예: 독거 어르신의 디지털 금융 사기 예방 교육]"
    ].join("\n"),
    followUpPrompt: [
      "이 사업계획서 초안을 10분 발표용 구성으로 바꿔줘.",
      "슬라이드 제목, 핵심 메시지, 발표자가 말할 한 문장으로 정리해줘."
    ].join("\n")
  },
  {
    category: "guide",
    title: "어려운 안내문을 쉬운 문장으로",
    purpose: "공문식 표현을 주민이나 대상자가 이해할 수 있는 안내문으로 바꾸는 AI의 문체 변환 능력을 보여줍니다.",
    teachingPoint: "정확도는 유지하면서 대상자의 언어로 바꾸게 하는 조건이 중요합니다.",
    Icon: MessageSquareText,
    prompt: [
      "너는 공공서비스 안내문을 쉽게 바꾸는 커뮤니케이션 전문가야.",
      "아래 안내문을 대상자가 이해하기 쉬운 문장으로 바꿔줘.",
      "",
      "조건",
      "1. 중학생도 이해할 수 있는 쉬운 표현으로 바꿔줘.",
      "2. 기관의 공식 정보, 신청 조건, 날짜, 장소는 바꾸지 마.",
      "3. 어려운 행정 용어는 풀어서 설명해줘.",
      "4. 문자메시지용 짧은 버전과 안내문용 자세한 버전을 모두 작성해줘.",
      "5. 오해가 생길 수 있는 표현은 따로 표시해줘.",
      "",
      "안내문",
      "[여기에 원문을 붙여넣기]"
    ].join("\n"),
    followUpPrompt: [
      "이 안내문을 더 따뜻하지만 과하게 친근하지 않은 톤으로 다시 다듬어줘.",
      "대상자가 해야 할 행동이 한눈에 보이도록 순서를 정리해줘."
    ].join("\n")
  },
  {
    category: "review",
    title: "AI 결과물 위험 검토",
    purpose: "AI가 만든 문장을 그대로 쓰지 않고 사실, 윤리, 개인정보, 표현 적절성을 점검하는 능력을 훈련합니다.",
    teachingPoint: "AI 교육의 마지막에는 잘 만드는 법보다 잘 검토하는 법을 반드시 보여줘야 합니다.",
    Icon: SearchCheck,
    prompt: [
      "너는 AI 결과물을 검토하는 교육 조교야.",
      "아래 AI 답변을 현장에서 바로 사용하기 전에 점검해줘.",
      "",
      "점검 기준",
      "1. 사실관계가 불확실한 부분",
      "2. 개인정보나 민감정보 위험",
      "3. 낙인, 차별, 시혜적으로 보일 수 있는 표현",
      "4. 법적·윤리적으로 조심해야 할 문장",
      "5. 사용자가 최종 확인해야 할 항목",
      "",
      "출력 형식",
      "문제 문장 / 위험 이유 / 안전한 대체 문장 / 확인 필요 여부",
      "",
      "AI 답변",
      "[여기에 AI가 만든 답변을 붙여넣기]"
    ].join("\n"),
    followUpPrompt: [
      "위 검토 결과를 반영해서 안전한 최종본으로 다시 작성해줘.",
      "단, 불확실한 정보는 확정하지 말고 [확인 필요]로 남겨줘."
    ].join("\n")
  },
  {
    category: "automation",
    title: "반복 업무 자동화 설계",
    purpose: "수강생이 자신의 업무를 입력하면 AI가 자동화 가능 지점과 사람의 확인 지점을 나눠 보여줍니다.",
    teachingPoint: "AI에게 일을 통째로 맡기는 게 아니라 입력, 처리, 검토를 분해하게 만드는 게 핵심입니다.",
    Icon: Braces,
    prompt: [
      "너는 업무 자동화 설계를 돕는 AI 활용 코치야.",
      "아래 반복 업무를 AI로 줄일 수 있는 방식으로 분석해줘.",
      "",
      "출력 형식",
      "1. 업무를 단계별로 나누기",
      "2. AI에게 맡길 수 있는 단계",
      "3. 사람이 반드시 확인해야 하는 단계",
      "4. 필요한 입력 자료",
      "5. 바로 써볼 프롬프트",
      "6. 실패할 수 있는 지점과 예방 방법",
      "",
      "조건",
      "- 개인정보가 포함될 가능성이 있으면 비식별 처리 방법을 먼저 알려줘.",
      "- 자동화가 과한 부분은 솔직하게 제외해줘.",
      "- 초보자가 오늘 실험할 수 있는 수준으로 제안해줘.",
      "",
      "반복 업무",
      "[예: 매주 회의록을 정리해서 팀 공유용 요약을 만드는 일]"
    ].join("\n"),
    followUpPrompt: [
      "위 자동화 설계를 실제로 실행하기 위한 체크리스트로 바꿔줘.",
      "준비물, 실행 순서, 검토 기준, 다음 개선 질문으로 나눠줘."
    ].join("\n")
  },
  {
    category: "document",
    title: "회의록을 실행계획으로",
    purpose: "회의 내용을 그냥 보관하지 않고 담당자, 일정, 다음 행동이 있는 실행표로 바꿉니다.",
    teachingPoint: "AI에게 요약만 시키지 말고 결정사항과 해야 할 일을 분리하게 하면 실무성이 높아집니다.",
    Icon: FileText,
    prompt: [
      "너는 사회복지기관 팀 회의록을 실행계획으로 바꾸는 실무 보조자야.",
      "아래 회의 메모를 읽고 바로 업무에 사용할 수 있는 실행계획으로 정리해줘.",
      "",
      "출력 형식",
      "1. 회의 핵심 요약 5줄",
      "2. 결정된 사항",
      "3. 해야 할 일 표: 업무 / 담당자 / 마감일 / 필요한 자료 / 확인할 점",
      "4. 다음 회의에서 확인할 안건",
      "5. 아직 결정되지 않은 사항",
      "",
      "조건",
      "- 메모에 없는 담당자나 날짜는 [확인 필요]로 표시해줘.",
      "- 말이 긴 부분은 실무자가 바로 볼 수 있게 짧게 정리해줘.",
      "",
      "회의 메모",
      "[여기에 회의 메모를 붙여넣기]"
    ].join("\n"),
    followUpPrompt: [
      "위 실행계획을 팀 단톡방에 공유할 짧은 공지문으로 바꿔줘.",
      "중요 일정과 담당 업무가 먼저 보이게 작성해줘."
    ].join("\n")
  },
  {
    category: "planning",
    title: "프로그램 홍보문 만들기",
    purpose: "사업계획서 문장을 참여자가 이해하기 쉬운 모집 안내문으로 바꿉니다.",
    teachingPoint: "대상, 혜택, 신청 방법, 문의처가 빠지지 않게 구조를 요구하는 것이 핵심입니다.",
    Icon: Presentation,
    prompt: [
      "너는 사회복지기관 프로그램 홍보문을 만드는 실무자야.",
      "아래 프로그램 정보를 바탕으로 참여자 모집 홍보문을 작성해줘.",
      "",
      "출력 형식",
      "1. 눈에 띄는 제목 5개",
      "2. 문자메시지용 짧은 홍보문",
      "3. 홈페이지/게시판용 자세한 홍보문",
      "4. 포스터에 넣을 핵심 문구",
      "5. 신청 전 확인할 사항",
      "",
      "조건",
      "- 과장 광고처럼 보이지 않게 작성해줘.",
      "- 대상, 일정, 장소, 비용, 신청 방법, 문의처가 빠지지 않게 해줘.",
      "- 모르는 정보는 [확인 필요]로 표시해줘.",
      "",
      "프로그램 정보",
      "[여기에 프로그램명, 대상, 일정, 장소, 내용, 신청 방법을 붙여넣기]"
    ].join("\n"),
    followUpPrompt: [
      "이 홍보문을 60대 이상 주민에게 더 잘 전달되는 표현으로 다시 써줘.",
      "단, 지나치게 유치하거나 과장된 표현은 피하고 신뢰감 있게 작성해줘."
    ].join("\n")
  },
  {
    category: "planning",
    title: "만족도 조사 문항 설계",
    purpose: "프로그램 종료 후 바로 사용할 수 있는 만족도 조사지를 만듭니다.",
    teachingPoint: "좋았나요? 같은 막연한 질문보다 개선에 쓸 수 있는 문항을 만들게 해야 합니다.",
    Icon: SearchCheck,
    prompt: [
      "너는 사회복지 프로그램 평가를 돕는 조사 설계자야.",
      "아래 프로그램에 맞는 만족도 조사 문항을 만들어줘.",
      "",
      "출력 형식",
      "1. 5점 척도 문항 8개",
      "2. 예/아니오 문항 3개",
      "3. 주관식 문항 4개",
      "4. 조사 안내문",
      "5. 결과 분석 시 보면 좋은 지표",
      "",
      "조건",
      "- 문항은 참여자가 쉽게 이해할 수 있게 짧게 작성해줘.",
      "- 기관 입장에서 듣고 싶은 답을 유도하는 표현은 피하게 해줘.",
      "- 다음 프로그램 개선에 도움이 되는 질문을 포함해줘.",
      "",
      "프로그램 설명",
      "[여기에 프로그램 목적, 대상, 주요 활동을 붙여넣기]"
    ].join("\n"),
    followUpPrompt: [
      "위 만족도 조사 문항을 구글폼에 바로 옮길 수 있는 형식으로 정리해줘.",
      "문항 유형과 선택지도 함께 표시해줘."
    ].join("\n")
  },
  {
    category: "record",
    title: "자원연계 기록 정리",
    purpose: "여러 기관과 연락한 내용을 누락 없이 정리하고 다음 연락 계획까지 만듭니다.",
    teachingPoint: "연계 업무는 연락처 목록보다 진행상태와 다음 행동이 중요하다는 점을 보여줍니다.",
    Icon: GitBranch,
    prompt: [
      "너는 사회복지기관 자원연계 업무를 정리하는 보조자야.",
      "아래 연락 메모를 자원연계 진행표로 바꿔줘.",
      "",
      "출력 형식",
      "기관명 / 연락한 사람 / 논의 내용 / 가능 자원 / 필요한 서류 / 다음 연락일 / 현재 상태",
      "",
      "추가로 정리할 것",
      "1. 바로 진행 가능한 연계",
      "2. 추가 확인이 필요한 연계",
      "3. 보류하거나 어려운 연계",
      "4. 담당자가 오늘 해야 할 일",
      "",
      "연락 메모",
      "[여기에 기관 연락 메모를 붙여넣기]"
    ].join("\n"),
    followUpPrompt: [
      "위 자원연계 진행표를 담당자 업무 체크리스트로 바꿔줘.",
      "오늘 할 일, 이번 주 할 일, 기다릴 일로 나눠줘."
    ].join("\n")
  },
  {
    category: "guide",
    title: "전화 응대 스크립트",
    purpose: "반복되는 문의 전화를 직원들이 일관되게 응대할 수 있도록 스크립트화합니다.",
    teachingPoint: "실무 대화문은 첫 인사, 확인 질문, 안내, 마무리까지 흐름을 잡아주면 바로 쓸 수 있습니다.",
    Icon: MessageSquareText,
    prompt: [
      "너는 사회복지기관 민원·문의 전화 응대 스크립트를 만드는 실무자야.",
      "아래 문의 유형에 맞는 전화 응대 스크립트를 작성해줘.",
      "",
      "출력 형식",
      "1. 첫 인사",
      "2. 문의 내용 확인 질문",
      "3. 기본 안내 멘트",
      "4. 추가 확인이 필요한 경우의 멘트",
      "5. 담당자 연결 또는 회신 안내",
      "6. 마무리 인사",
      "",
      "조건",
      "- 직원이 그대로 읽어도 어색하지 않게 대화체로 작성해줘.",
      "- 확정할 수 없는 내용은 즉답하지 않고 확인 후 안내하는 방식으로 써줘.",
      "- 불만이 있는 문의자에게 쓸 수 있는 차분한 표현도 포함해줘.",
      "",
      "문의 유형",
      "[예: 프로그램 신청 가능 여부 문의, 후원 물품 문의, 이용 시간 문의]"
    ].join("\n"),
    followUpPrompt: [
      "이 스크립트를 신규 직원 교육용으로 바꿔줘.",
      "좋은 응대 예시와 피해야 할 응대 예시를 함께 작성해줘."
    ].join("\n")
  },
  {
    category: "document",
    title: "월간 실적 요약 보고",
    purpose: "숫자와 메모를 기관 내부 보고용 요약으로 정리합니다.",
    teachingPoint: "실적 보고는 나열보다 변화, 이슈, 다음 계획이 함께 있어야 읽힙니다.",
    Icon: FileText,
    prompt: [
      "너는 사회복지기관 월간 실적보고를 정리하는 실무 보조자야.",
      "아래 숫자와 메모를 바탕으로 월간 실적 요약 보고 초안을 작성해줘.",
      "",
      "출력 형식",
      "1. 이번 달 핵심 요약",
      "2. 주요 실적 표",
      "3. 전월 대비 눈에 띄는 변화",
      "4. 운영 중 이슈",
      "5. 다음 달 계획",
      "6. 상급자에게 확인받을 사항",
      "",
      "조건",
      "- 숫자는 임의로 바꾸지 마.",
      "- 해석이 필요한 부분은 근거와 함께 조심스럽게 작성해줘.",
      "- 빠진 숫자는 [자료 필요]로 표시해줘.",
      "",
      "자료",
      "[여기에 월간 실적 숫자와 메모를 붙여넣기]"
    ].join("\n"),
    followUpPrompt: [
      "위 보고 초안을 관장 또는 팀장에게 보고하는 1분 구두보고 대본으로 바꿔줘.",
      "핵심 변화와 요청사항이 먼저 나오게 해줘."
    ].join("\n")
  },
  {
    category: "automation",
    title: "엑셀 표 분석 질문 만들기",
    purpose: "실무자가 가진 엑셀 자료를 어떤 관점으로 분석할지 질문 목록부터 만듭니다.",
    teachingPoint: "AI 분석은 파일을 던지는 것보다 먼저 알고 싶은 질문을 설계하는 과정이 중요합니다.",
    Icon: Braces,
    prompt: [
      "너는 사회복지기관 실적 엑셀을 분석하기 전 질문을 설계하는 데이터 코치야.",
      "아래 엑셀 컬럼 목록을 보고 분석 질문을 만들어줘.",
      "",
      "출력 형식",
      "1. 기본 현황을 보는 질문 5개",
      "2. 변화나 추세를 보는 질문 5개",
      "3. 대상자 특성별로 비교할 질문 5개",
      "4. 운영 개선에 도움이 되는 질문 5개",
      "5. 엑셀에서 추가로 있으면 좋은 컬럼",
      "",
      "조건",
      "- 사회복지기관 실무자가 이해할 수 있는 쉬운 말로 써줘.",
      "- 분석 결과를 보고 어떤 의사결정을 할 수 있는지도 함께 적어줘.",
      "",
      "엑셀 컬럼 목록",
      "[예: 날짜, 프로그램명, 참여자 수, 연령대, 거주동, 만족도, 재참여 여부]"
    ].join("\n"),
    followUpPrompt: [
      "위 분석 질문 중 가장 먼저 보면 좋은 질문 5개만 골라줘.",
      "각 질문마다 필요한 피벗테이블 구조를 설명해줘."
    ].join("\n")
  },
  {
    category: "planning",
    title: "행사 운영 체크리스트",
    purpose: "행사 준비 업무를 일정별 체크리스트로 바꿔 누락을 줄입니다.",
    teachingPoint: "AI에게 결과물만 요구하지 말고 시간순 실행 단위로 쪼개게 하는 훈련에 좋습니다.",
    Icon: Check,
    prompt: [
      "너는 사회복지기관 행사를 준비하는 운영 매니저야.",
      "아래 행사 정보를 바탕으로 준비 체크리스트를 만들어줘.",
      "",
      "출력 형식",
      "1. 행사 4주 전",
      "2. 행사 2주 전",
      "3. 행사 전날",
      "4. 행사 당일",
      "5. 행사 종료 후",
      "",
      "각 단계에는 담당자, 준비물, 확인할 것, 실패 예방 팁을 포함해줘.",
      "",
      "조건",
      "- 사회복지기관에서 실제로 챙기는 접수, 장소, 물품, 안내, 사진, 만족도 조사, 결과보고를 포함해줘.",
      "- 행사 규모가 작아도 쓸 수 있게 현실적인 수준으로 작성해줘.",
      "",
      "행사 정보",
      "[행사명, 대상, 예상 인원, 장소, 일정, 주요 활동을 붙여넣기]"
    ].join("\n"),
    followUpPrompt: [
      "이 체크리스트를 담당자별 업무분장표로 바꿔줘.",
      "담당자, 업무, 마감일, 확인 상태 열이 있는 표로 작성해줘."
    ].join("\n")
  },
  {
    category: "guide",
    title: "후원 요청 제안서 초안",
    purpose: "지역 기업이나 단체에 보낼 후원 요청 내용을 정중한 제안서로 만듭니다.",
    teachingPoint: "후원 요청은 기관 필요보다 상대가 이해할 명분과 참여 방식을 분명히 해야 합니다.",
    Icon: Users,
    prompt: [
      "너는 사회복지기관 후원 제안서를 작성하는 실무자야.",
      "아래 내용을 바탕으로 지역 기업 또는 단체에 보낼 후원 요청 제안서 초안을 작성해줘.",
      "",
      "출력 형식",
      "1. 제안 제목",
      "2. 기관 및 사업 소개",
      "3. 후원이 필요한 이유",
      "4. 요청하는 후원 내용",
      "5. 후원자가 참여했을 때의 의미",
      "6. 진행 절차",
      "7. 감사 및 결과 공유 방법",
      "8. 문의처",
      "",
      "조건",
      "- 부담을 강요하는 표현은 피하고 정중하게 제안해줘.",
      "- 금액이나 물품 수량이 불확실하면 [협의 가능] 또는 [확인 필요]로 표시해줘.",
      "",
      "후원 요청 정보",
      "[여기에 사업명, 대상, 필요한 후원, 기간, 기관 소개를 붙여넣기]"
    ].join("\n"),
    followUpPrompt: [
      "위 제안서를 이메일 본문으로 짧게 바꿔줘.",
      "제목 5개와 함께, 너무 딱딱하지 않은 정중한 문체로 작성해줘."
    ].join("\n")
  },
  {
    category: "record",
    title: "방문 일정표 만들기",
    purpose: "여러 방문·상담·프로그램 일정을 보기 좋은 주간 일정표로 정리합니다.",
    teachingPoint: "AI는 일정 조율에서 누락된 정보와 충돌 가능성을 찾는 보조자로 쓰기 좋습니다.",
    Icon: Clock3,
    prompt: [
      "너는 사회복지기관 주간 방문 일정을 정리하는 실무 보조자야.",
      "아래 메모를 주간 일정표로 바꿔줘.",
      "",
      "출력 형식",
      "요일 / 시간 / 장소 / 대상 또는 업무 / 담당자 / 준비물 / 확인 필요 사항",
      "",
      "추가로 정리할 것",
      "1. 시간이 겹칠 가능성이 있는 일정",
      "2. 이동 시간이 부족해 보이는 일정",
      "3. 준비물이 누락된 일정",
      "4. 전날 확인해야 할 연락 목록",
      "",
      "조건",
      "- 메모에 없는 정보는 임의로 만들지 말고 [확인 필요]로 표시해줘.",
      "- 일정표는 한눈에 보기 쉽게 작성해줘.",
      "",
      "일정 메모",
      "[여기에 방문·상담·프로그램 일정 메모를 붙여넣기]"
    ].join("\n"),
    followUpPrompt: [
      "이 일정표를 담당자별 일정으로 다시 정렬해줘.",
      "담당자마다 오늘 확인할 연락과 준비물을 따로 적어줘."
    ].join("\n")
  },
  {
    category: "review",
    title: "사업 결과보고서 점검",
    purpose: "작성한 결과보고서가 빠진 항목 없이 읽히는지 점검합니다.",
    teachingPoint: "검토 프롬프트는 단순 맞춤법보다 근거, 수치, 다음 개선점까지 보게 해야 합니다.",
    Icon: SearchCheck,
    prompt: [
      "너는 사회복지기관 사업 결과보고서를 검토하는 실무 코치야.",
      "아래 결과보고서 초안을 읽고 보완할 점을 찾아줘.",
      "",
      "점검 기준",
      "1. 사업 목적과 결과가 연결되는지",
      "2. 수치나 근거가 부족한 문장",
      "3. 참여자 반응 또는 만족도 설명이 부족한 부분",
      "4. 예산·일정·운영 과정에서 빠진 내용",
      "5. 다음 사업 개선점으로 이어질 내용",
      "",
      "출력 형식",
      "보완 위치 / 문제점 / 왜 중요한지 / 수정 제안 문장",
      "",
      "결과보고서 초안",
      "[여기에 결과보고서 초안을 붙여넣기]"
    ].join("\n"),
    followUpPrompt: [
      "위 점검 결과를 반영해서 결과보고서의 '성과 및 향후 계획' 부분만 다시 작성해줘.",
      "과장하지 말고 실제 개선 방향이 보이게 써줘."
    ].join("\n")
  }
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
const localLikeKey = `ai-class-likes:${roomId}`;
const localCommentKey = `ai-class-comments:${roomId}`;
const localClientKey = `ai-class-client:${roomId}`;

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

function getStoredClientId() {
  const saved = window.localStorage.getItem(localClientKey);

  if (saved) {
    return saved;
  }

  const nextId = crypto.randomUUID();
  window.localStorage.setItem(localClientKey, nextId);
  return nextId;
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
  const [likes, setLikes] = useState<IdeaLike[]>([]);
  const [comments, setComments] = useState<IdeaComment[]>([]);
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
  const [commentContent, setCommentContent] = useState("");
  const [editIdeaId, setEditIdeaId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editContent, setEditContent] = useState("");
  const [toolMode, setToolMode] = useState<ToolMode>("build");
  const [promptMode, setPromptMode] = useState<PromptMode>("clarify");
  const [promptCategory, setPromptCategory] = useState<PromptCategory>("all");
  const [openFollowUpTitle, setOpenFollowUpTitle] = useState<string | null>(null);
  const [activeView, setActiveView] = useState<AppView>("board");
  const [clientId] = useState(() => (typeof window === "undefined" ? "" : getStoredClientId()));

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

  const relatedComments = useMemo(() => {
    if (!selectedIdea) {
      return [];
    }

    return [...comments]
      .filter((comment) => comment.ideaId === selectedIdea.id)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [comments, selectedIdea]);

  const branchCounts = useMemo(() => {
    return ideas.reduce<Record<string, number>>((counts, idea) => {
      if (idea.parentId) {
        counts[idea.parentId] = (counts[idea.parentId] ?? 0) + 1;
      }

      return counts;
    }, {});
  }, [ideas]);

  const likeCounts = useMemo(() => {
    return likes.reduce<Record<string, number>>((counts, like) => {
      counts[like.ideaId] = (counts[like.ideaId] ?? 0) + 1;
      return counts;
    }, {});
  }, [likes]);

  const commentCounts = useMemo(() => {
    return comments.reduce<Record<string, number>>((counts, comment) => {
      counts[comment.ideaId] = (counts[comment.ideaId] ?? 0) + 1;
      return counts;
    }, {});
  }, [comments]);

  const likedIdeaIds = useMemo(() => {
    return new Set(likes.filter((like) => like.clientId === clientId).map((like) => like.ideaId));
  }, [clientId, likes]);

  const stats = useMemo(
    () => ({
      ideas: ideas.length,
      building: ideas.filter((idea) => idea.stage === "building").length,
      comments: comments.length,
      likes: likes.length
    }),
    [comments.length, ideas, likes.length]
  );

  const aiPrompt = useMemo(() => getPrompt(promptMode, selectedIdea), [promptMode, selectedIdea]);

  const activeViewMeta = useMemo(
    () => appViews.find((view) => view.id === activeView) ?? appViews[0],
    [activeView]
  );

  const visiblePromptExamples = useMemo(() => {
    if (promptCategory === "all") {
      return promptExamples;
    }

    return promptExamples.filter((example) => example.category === promptCategory);
  }, [promptCategory]);

  const activeIntent = useMemo(
    () => intentOptions.find((option) => option.id === intent) ?? intentOptions[0],
    [intent]
  );

  const activePromptMode = useMemo(
    () => promptModes.find((mode) => mode.id === promptMode) ?? promptModes[0],
    [promptMode]
  );

  const changeView = useCallback((view: AppView) => {
    setActiveView(view);

    if (typeof window !== "undefined") {
      window.history.replaceState(null, "", `#${view}`);
    }
  }, []);

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

  const persistSocialLocal = useCallback((nextLikes: IdeaLike[], nextComments: IdeaComment[]) => {
    window.localStorage.setItem(localLikeKey, JSON.stringify(nextLikes));
    window.localStorage.setItem(localCommentKey, JSON.stringify(nextComments));
    setLikes([...nextLikes].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
    setComments([...nextComments].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
  }, []);

  useEffect(() => {
    function syncViewFromHash() {
      const nextView = window.location.hash.replace("#", "");

      if (isAppView(nextView)) {
        setActiveView(nextView);
      }
    }

    syncViewFromHash();
    window.addEventListener("hashchange", syncViewFromHash);

    return () => window.removeEventListener("hashchange", syncViewFromHash);
  }, []);

  const loadLocal = useCallback(() => {
    try {
      const savedIdeas = window.localStorage.getItem(localIdeaKey);
      const savedEvents = window.localStorage.getItem(localEventKey);
      const savedLikes = window.localStorage.getItem(localLikeKey);
      const savedComments = window.localStorage.getItem(localCommentKey);
      const nextIdeas = savedIdeas ? (JSON.parse(savedIdeas) as Idea[]) : createSeedIdeas();
      const nextEvents = savedEvents ? (JSON.parse(savedEvents) as IdeaEvent[]) : createSeedEvents();
      const nextLikes = savedLikes ? (JSON.parse(savedLikes) as IdeaLike[]) : [];
      const nextComments = savedComments ? (JSON.parse(savedComments) as IdeaComment[]) : [];

      persistLocal(nextIdeas, nextEvents);
      persistSocialLocal(nextLikes, nextComments);
      setSelectedId((current) => current ?? nextIdeas[0]?.id ?? null);
    } catch {
      const seedIdeas = createSeedIdeas();
      const seedEvents = createSeedEvents();

      persistLocal(seedIdeas, seedEvents);
      persistSocialLocal([], []);
      setSelectedId(seedIdeas[0]?.id ?? null);
    }
  }, [persistLocal, persistSocialLocal]);

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
        const [ideasResult, eventsResult, likesResult, commentsResult] = await Promise.all([
          supabase
            .from("class_ideas")
            .select("*")
            .eq("room_id", roomId)
            .order("updated_at", { ascending: false }),
          supabase
            .from("class_idea_events")
            .select("*")
            .eq("room_id", roomId)
            .order("created_at", { ascending: false }),
          supabase
            .from("class_idea_likes")
            .select("*")
            .eq("room_id", roomId)
            .order("created_at", { ascending: false }),
          supabase
            .from("class_idea_comments")
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

        if (likesResult.error) {
          throw likesResult.error;
        }

        if (commentsResult.error) {
          throw commentsResult.error;
        }

        const nextIdeas = (ideasResult.data as IdeaRow[]).map(rowToIdea);
        const nextEvents = (eventsResult.data as IdeaEventRow[]).map(rowToEvent);
        const nextLikes = (likesResult.data as IdeaLikeRow[]).map(rowToLike);
        const nextComments = (commentsResult.data as IdeaCommentRow[]).map(rowToComment);

        setIdeas(sortIdeas(nextIdeas));
        setEvents(sortEvents(nextEvents));
        setLikes(nextLikes);
        setComments(nextComments);
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
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "class_idea_likes",
          filter: `room_id=eq.${roomId}`
        },
        () => {
          void refreshData(true);
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "class_idea_comments",
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

  async function handleToggleLike(idea: Idea) {
    const writer = cleanName(author);
    const activeClientId = clientId || getStoredClientId();
    const existingLike = likes.find(
      (like) => like.ideaId === idea.id && like.clientId === activeClientId
    );

    setIsSaving(true);

    try {
      if (supabase) {
        if (existingLike) {
          const { error } = await supabase
            .from("class_idea_likes")
            .delete()
            .eq("idea_id", idea.id)
            .eq("client_id", activeClientId);

          if (error) {
            throw error;
          }
        } else {
          const { error } = await supabase.from("class_idea_likes").insert({
            idea_id: idea.id,
            room_id: roomId,
            author: writer,
            client_id: activeClientId
          });

          if (error) {
            throw error;
          }
        }

        await refreshData(true);
      } else if (existingLike) {
        persistSocialLocal(
          likes.filter((like) => like.id !== existingLike.id),
          comments
        );
      } else {
        const nextLike: IdeaLike = {
          id: crypto.randomUUID(),
          ideaId: idea.id,
          roomId,
          author: writer,
          clientId: activeClientId,
          createdAt: new Date().toISOString()
        };

        persistSocialLocal([nextLike, ...likes], comments);
      }

      setNotice(existingLike ? "좋아요를 취소했습니다." : "이 아이디어에 공감했습니다.");
    } catch {
      setNotice("좋아요를 반영하지 못했습니다. 연결 상태를 확인해 주세요.");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleAddComment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedIdea || !commentContent.trim()) {
      setNotice("댓글 내용을 적어 주세요.");
      return;
    }

    const writer = cleanName(author);
    const activeClientId = clientId || getStoredClientId();
    const content = commentContent.trim();

    setIsSaving(true);

    try {
      if (supabase) {
        const { error } = await supabase.from("class_idea_comments").insert({
          idea_id: selectedIdea.id,
          room_id: roomId,
          author: writer,
          client_id: activeClientId,
          content
        });

        if (error) {
          throw error;
        }

        await refreshData(true);
      } else {
        const nextComment: IdeaComment = {
          id: crypto.randomUUID(),
          ideaId: selectedIdea.id,
          roomId,
          author: writer,
          clientId: activeClientId,
          content,
          createdAt: new Date().toISOString()
        };

        persistSocialLocal(likes, [nextComment, ...comments]);
      }

      setCommentContent("");
      setNotice("댓글을 남겼습니다.");
    } catch {
      setNotice("댓글을 저장하지 못했습니다. 연결 상태를 확인해 주세요.");
    } finally {
      setIsSaving(false);
    }
  }

  async function writeClipboard(value: string) {
    if (navigator.clipboard?.writeText && window.isSecureContext) {
      try {
        await navigator.clipboard.writeText(value);
        return true;
      } catch {
        // 일부 브라우저/미리보기 환경에서는 Clipboard API 권한이 막힐 수 있습니다.
      }
    }

    const textarea = document.createElement("textarea");
    textarea.value = value;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.top = "-9999px";
    textarea.style.left = "-9999px";
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    textarea.setSelectionRange(0, textarea.value.length);

    try {
      return document.execCommand("copy");
    } catch {
      return false;
    } finally {
      textarea.remove();
    }
  }

  async function copyText(value: string, successMessage: string) {
    const copied = await writeClipboard(value);

    if (copied) {
      setNotice(successMessage);
    } else {
      setNotice("복사 권한이 막혀 있습니다. 프롬프트를 직접 선택해 복사해 주세요.");
    }
  }

  async function copyPrompt() {
    await copyText(aiPrompt, "AI 프롬프트를 복사했습니다.");
  }

  async function copyExamplePrompt(title: string, prompt: string) {
    await copyText(prompt, `${title} 프롬프트를 복사했습니다.`);
  }

  const ActiveViewIcon = activeViewMeta.Icon;

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

      <main className={`workspace workspace--${activeView}`}>
        <section className="view-switcher" aria-label="화면 선택">
          <div className="view-summary">
            <span className="view-icon">
              <ActiveViewIcon size={20} />
            </span>
            <div>
              <span className="section-kicker">AI Class App</span>
              <h1>{activeViewMeta.title}</h1>
              <p>{activeViewMeta.description}</p>
            </div>
          </div>

          <div className="view-tabs">
            {appViews.map(({ Icon, id, label }) => (
              <button
                className={activeView === id ? "is-active" : ""}
                key={id}
                onClick={() => changeView(id)}
                type="button"
              >
                <Icon size={17} />
                {label}
              </button>
            ))}
          </div>
        </section>

        {activeView === "mission" ? (
          <section className="mission-panel" aria-label="오늘의 실습 미션">
            <div className="mission-header">
              <div>
                <span className="section-kicker">Mission</span>
                <h2>실습 흐름</h2>
              </div>
              <button className="primary-button" onClick={() => changeView("prompts")} type="button">
                <Copy size={18} />
                프롬프트로 시작
              </button>
            </div>

            <div className="mission-grid">
              {missionSteps.map(({ Icon, action, body, step, target, title }) => (
                <article className="mission-card" key={step}>
                  <div className="mission-card-top">
                    <span>{step}</span>
                    <Icon size={18} />
                  </div>
                  <h3>{title}</h3>
                  <p>{body}</p>
                  <button className="secondary-button" onClick={() => changeView(target)} type="button">
                    {action}
                  </button>
                </article>
              ))}
            </div>
          </section>
        ) : null}

        {activeView === "board" ? (
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
        ) : null}

        {activeView === "prompts" ? (
          <section className="prompt-kit" aria-label="프롬프트 예제">
          <div className="prompt-kit-header">
            <div>
              <span className="section-kicker">Prompt Kit</span>
              <h2>바로 쓰는 프롬프트</h2>
            </div>

            <div className="prompt-category-tabs" aria-label="프롬프트 카테고리">
              {promptCategories.map((category) => (
                <button
                  className={promptCategory === category.id ? "is-active" : ""}
                  key={category.id}
                  onClick={() => {
                    setPromptCategory(category.id);
                    setOpenFollowUpTitle(null);
                  }}
                  type="button"
                >
                  {category.label}
                </button>
              ))}
            </div>
          </div>

          <div className="prompt-example-grid">
            {visiblePromptExamples.map(
              ({ Icon, followUpPrompt, prompt, purpose, teachingPoint, title }, index) => {
                const isFollowUpOpen = openFollowUpTitle === title;
                const followUpId = `follow-up-prompt-${index}`;

                return (
                  <article className="prompt-example-card" key={title}>
                    <div className="prompt-example-top">
                      <span>
                        <Icon size={17} />
                      </span>
                      <div>
                        <h3>{title}</h3>
                        <p>{purpose}</p>
                      </div>
                    </div>
                    <div className="prompt-teaching-point">
                      <strong>강의 포인트</strong>
                      <span>{teachingPoint}</span>
                    </div>
                    <pre className="prompt-main-copy">{prompt}</pre>
                    <div className="prompt-copy-actions">
                      <button
                        className="secondary-button"
                        onClick={() => void copyExamplePrompt(title, prompt)}
                        type="button"
                      >
                        <Copy size={17} />
                        본문 복사
                      </button>
                      <button
                        aria-controls={followUpId}
                        aria-expanded={isFollowUpOpen}
                        className="secondary-button"
                        onClick={() => setOpenFollowUpTitle(isFollowUpOpen ? null : title)}
                        type="button"
                      >
                        {isFollowUpOpen ? <ChevronUp size={17} /> : <ChevronDown size={17} />}
                        {isFollowUpOpen ? "후속 닫기" : "후속 보기"}
                      </button>
                    </div>
                    {isFollowUpOpen ? (
                      <div className="prompt-follow-up-panel" id={followUpId}>
                        <div className="prompt-follow-up-head">
                          <strong>후속 프롬프트</strong>
                          <button
                            className="secondary-button"
                            onClick={() => void copyExamplePrompt(`${title} 후속`, followUpPrompt)}
                            type="button"
                          >
                            <Copy size={16} />
                            복사
                          </button>
                        </div>
                        <pre>{followUpPrompt}</pre>
                      </div>
                    ) : null}
                  </article>
                );
              }
            )}
          </div>
          </section>
        ) : null}

        {activeView === "board" ? (
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
                <span>{stats.likes}개 공감</span>
                <span>{stats.comments}개 댓글</span>
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
                  </button>
                  <div className="card-footer">
                    <span className="author-chip">
                      <Users size={14} />
                      {idea.author}
                    </span>
                    <div className="reaction-row" aria-label="아이디어 반응">
                      <button
                        aria-pressed={likedIdeaIds.has(idea.id)}
                        className={likedIdeaIds.has(idea.id) ? "reaction-button is-active" : "reaction-button"}
                        disabled={isSaving}
                        onClick={() => void handleToggleLike(idea)}
                        type="button"
                      >
                        <Heart size={14} />
                        {likeCounts[idea.id] ?? 0}
                      </button>
                      <button
                        className="reaction-button"
                        onClick={() => {
                          setSelectedId(idea.id);
                          setToolMode("comments");
                        }}
                        type="button"
                      >
                        <MessageSquareText size={14} />
                        {commentCounts[idea.id] ?? 0}
                      </button>
                      <span className="reaction-pill">
                        <GitBranch size={14} />
                        {branchCounts[idea.id] ?? 0}
                      </span>
                    </div>
                  </div>
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
        ) : null}

        {activeView === "board" ? (
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
                <div className="focus-reactions" aria-label="선택한 아이디어 반응">
                  <button
                    aria-pressed={likedIdeaIds.has(selectedIdea.id)}
                    className={likedIdeaIds.has(selectedIdea.id) ? "reaction-button is-active" : "reaction-button"}
                    disabled={isSaving}
                    onClick={() => void handleToggleLike(selectedIdea)}
                    type="button"
                  >
                    <Heart size={15} />
                    공감 {likeCounts[selectedIdea.id] ?? 0}
                  </button>
                  <button className="reaction-button" onClick={() => setToolMode("comments")} type="button">
                    <MessageSquareText size={15} />
                    댓글 {commentCounts[selectedIdea.id] ?? 0}
                  </button>
                  <span className="reaction-pill">
                    <GitBranch size={15} />
                    이어쓰기 {branchCounts[selectedIdea.id] ?? 0}
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
                  className={toolMode === "comments" ? "is-active" : ""}
                  onClick={() => setToolMode("comments")}
                  type="button"
                >
                  <MessageSquareText size={16} />
                  댓글
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
                  <form className="stack-form branch-composer" onSubmit={handleBranchIdea}>
                    <label>
                      <span className="composer-label">
                        <MessageSquareText size={15} />
                        댓글처럼 이어 남기기
                      </span>
                      <span>이 생각에 이어서</span>
                      <textarea
                        aria-label="댓글처럼 이어 남기기"
                        value={branchContent}
                        onChange={(event) => setBranchContent(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.stopPropagation();
                          }
                        }}
                        placeholder="더 좋은 방향, 다른 활용 장면, 걱정되는 점을 적어 주세요."
                      />
                    </label>
                    <div className="composer-footer">
                      <span>Enter로 줄바꿈 · 자유롭게 이어쓰기</span>
                    </div>
                    <button className="primary-button" disabled={isSaving} type="submit">
                      <GitBranch size={18} />
                      이어쓰기
                    </button>
                  </form>
                ) : null}

                {toolMode === "comments" ? (
                  <div className="comment-tool">
                    <form className="comment-form" onSubmit={handleAddComment}>
                      <label>
                        <span>댓글 남기기</span>
                        <textarea
                          value={commentContent}
                          onChange={(event) => setCommentContent(event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                              event.currentTarget.form?.requestSubmit();
                            }
                          }}
                          placeholder="공감한 점, 질문, 보완하면 좋을 점을 짧게 남겨 주세요."
                        />
                      </label>
                      <button className="primary-button" disabled={isSaving} type="submit">
                        <MessageSquareText size={18} />
                        댓글 달기
                      </button>
                    </form>

                    <div className="comment-list" aria-label="댓글 목록">
                      {relatedComments.length ? (
                        relatedComments.map((comment) => (
                          <article className="comment-item" key={comment.id}>
                            <div>
                              <strong>{comment.author}</strong>
                              <time>{formatTime(comment.createdAt)}</time>
                            </div>
                            <p>{comment.content}</p>
                          </article>
                        ))
                      ) : (
                        <p className="quiet-text">아직 댓글이 없습니다. 첫 반응을 남겨 주세요.</p>
                      )}
                    </div>
                  </div>
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
        ) : null}

        {activeView === "check" ? (
          <section className="safety-panel" aria-label="AI 사용 체크리스트">
            <div className="safety-header">
              <div>
                <span className="section-kicker">Check</span>
                <h2>AI 결과물 사용 전 확인하기</h2>
              </div>
              <button className="primary-button" onClick={() => changeView("board")} type="button">
                <Users size={18} />
                보드에 공유
              </button>
            </div>

            <div className="safety-grid">
              {safetyChecks.map((item) => (
                <article className="safety-card" key={item.title}>
                  <span className="safety-card-icon">
                    <Check size={18} />
                  </span>
                  <h3>{item.title}</h3>
                  <p>{item.body}</p>
                  <div className="before-after">
                    <div>
                      <strong>주의</strong>
                      <span>{item.bad}</span>
                    </div>
                    <div>
                      <strong>권장</strong>
                      <span>{item.better}</span>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </section>
        ) : null}
      </main>
    </div>
  );
}
