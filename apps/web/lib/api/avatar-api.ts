"use client";

import { apiRequest } from "./http-client";

export type ApiAvatarStatus = "draft" | "active" | "disabled";

export type AvatarInteractionAvailability = "ready" | "needs_attention" | "preparing" | "unavailable";

export type ApiVoiceConfig = {
  provider: "openai" | "elevenlabs";
  voiceId: string;
  displayName?: string;
  description?: string;
  speakingRate: number;
};

export type ApiAvatarLiveAvatarConfig = {
  provider: "liveavatar";
  avatarId: string;
  displayName?: string;
  thumbnailUrl?: string;
  mode: string;
  sandbox: boolean;
};

export type ApiAvatar = {
  id: string;
  name: string;
  description: string;
  instructions: string;
  context: string;
  voiceConfig: unknown;
  liveAvatarConfig: unknown;
  providerStatus: "preparing" | "ready" | "needs_attention";
  hasPreviousUsableVersion: boolean;
  status: ApiAvatarStatus;
  createdAt: string;
  updatedAt: string;
};

export type ApiAvatarSummary = {
  id: string;
  name: string;
  description: string;
  status: ApiAvatarStatus;
  providerSyncStatus: "not_synced" | "syncing" | "synced" | "failed";
  thumbnailUrl: string | null;
  interactionAvailability: AvatarInteractionAvailability;
  createdAt: string;
  updatedAt: string;
  access: {
    type: "owner" | "shared";
    canEdit: boolean;
    canShare: boolean;
    canInteract: boolean;
  };
};

export type ApiInteractionContext = {
  avatar: {
    id: string;
    name: string;
    description: string;
    status: ApiAvatarStatus;
  };
  access: {
    type: "owner" | "shared";
    canInteract: boolean;
  };
  contextStatus: "ready" | "processing" | "failed";
  voiceAvailability: "ready" | "processing" | "unavailable";
};

export type ApiContextDocumentStatus = "pending_upload" | "processing" | "ready" | "failed" | "deleting";

export type ApiContextDocument = {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  status: ApiContextDocumentStatus;
  hasPreviousUsableVersion: boolean;
  error: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ApiAvatarContext = {
  text: string;
  status: "ready" | "processing" | "failed";
  hasPreviousUsableVersion: boolean;
  updatedAt: string;
  documents: ApiContextDocument[];
};

export type PresignedDocumentUpload = {
  document: ApiContextDocument;
  upload: {
    uploadUrl: string;
    headers: Record<string, string>;
    expiresAt: string;
  };
};

export type AvatarListScope = "all" | "owned" | "shared";

export type CreateAvatarRequest = {
  name: string;
  description: string;
  instructions: string;
  context: string;
  voiceConfig: ApiVoiceConfig;
  liveAvatarConfig: ApiAvatarLiveAvatarConfig;
  status: ApiAvatarStatus;
};

export type UpdateAvatarRequest = Partial<CreateAvatarRequest>;

export type ApiAgentProviderSync = {
  status: "ready";
};

export type ApiVoiceSession = {
  conversationId: string;
  realtimeSessionId: string;
  providerAgentId: string;
  sessionToken: string;
  sessionId: string | null;
};

export type EndedApiVoiceSession = {
  id: string;
  conversationId: string | null;
  providerSessionId: string | null;
  status: string;
  endedAt: string | null;
};

export type VoiceSessionTranscriptEntry = {
  role: "user" | "assistant";
  content: string;
  metadata?: Record<string, unknown>;
};

export type ApiConversationMode = "text" | "voice";
export type ApiConversationStatus = "active" | "ended";
export type ApiConversationMessageRole = "user" | "assistant" | "system";

export type ApiConversationSummary = {
  id: string;
  avatarAgentId: string;
  title: string | null;
  mode: ApiConversationMode;
  status: ApiConversationStatus;
  lastMessageAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ApiConversationMessage = {
  id: string;
  role: ApiConversationMessageRole;
  content: string;
  metadata: unknown | null;
  createdAt: string;
};

export type ApiConversationDetail = ApiConversationSummary & {
  messages: ApiConversationMessage[];
};

export function listAvatars(scope: AvatarListScope = "all") {
  return apiRequest<{ avatars: ApiAvatarSummary[] }>(`/avatars?scope=${scope}`);
}

export function createAvatar(input: CreateAvatarRequest) {
  return apiRequest<{ avatar: ApiAvatar }>("/avatars", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function getAvatar(avatarId: string) {
  return apiRequest<{ avatar: ApiAvatar }>(`/avatars/${avatarId}`);
}

export function getAvatarInteractionContext(avatarId: string) {
  return apiRequest<{ interactionContext: ApiInteractionContext }>(
    `/avatars/${avatarId}/interaction-context`
  );
}

export function listAvatarConversations(avatarId: string) {
  return apiRequest<{ conversations: ApiConversationSummary[] }>(`/avatars/${avatarId}/conversations`);
}

export function createAvatarConversation(avatarId: string, mode: ApiConversationMode = "text") {
  return apiRequest<{ conversation: ApiConversationSummary }>(`/avatars/${avatarId}/conversations`, {
    method: "POST",
    body: JSON.stringify({ mode }),
  });
}

export function getLatestAvatarConversation(avatarId: string) {
  return apiRequest<{ conversation: ApiConversationSummary | null }>(
    `/avatars/${avatarId}/conversations/latest`
  );
}

export function getConversation(conversationId: string) {
  return apiRequest<{ conversation: ApiConversationDetail }>(`/conversations/${conversationId}`);
}

export function updateAvatar(avatarId: string, input: UpdateAvatarRequest) {
  return apiRequest<{ avatar: ApiAvatar }>(`/avatars/${avatarId}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function getAvatarContext(avatarId: string) {
  return apiRequest<{ context: ApiAvatarContext }>(`/avatars/${avatarId}/context`);
}

export function updateAvatarContext(avatarId: string, text: string) {
  return apiRequest<{ context: ApiAvatarContext }>(`/avatars/${avatarId}/context`, {
    method: "PATCH",
    body: JSON.stringify({ text }),
  });
}

export function presignDocumentUpload(
  avatarId: string,
  input: { fileName: string; mimeType: string; sizeBytes: number }
) {
  return apiRequest<PresignedDocumentUpload>(`/avatars/${avatarId}/documents/presign-upload`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function confirmDocumentUpload(documentId: string) {
  return apiRequest<{ document: ApiContextDocument }>(`/documents/${documentId}/confirm-upload`, {
    method: "POST",
  });
}

export function retryDocument(documentId: string) {
  return apiRequest<{ document: ApiContextDocument }>(`/documents/${documentId}/retry`, {
    method: "POST",
  });
}

export function deleteDocument(documentId: string) {
  return apiRequest<{ ok: true }>(`/documents/${documentId}`, { method: "DELETE" });
}

export async function uploadAvatarDocument(
  avatarId: string,
  file: File,
  onProgress?: (progress: number) => void
) {
  const mimeType = getSupportedDocumentMimeType(file);
  const presigned = await presignDocumentUpload(avatarId, {
    fileName: file.name,
    mimeType,
    sizeBytes: file.size,
  });
  await putFile(presigned.upload.uploadUrl, presigned.upload.headers, file, onProgress);
  return confirmDocumentUpload(presigned.document.id);
}

function putFile(
  url: string,
  headers: Record<string, string>,
  file: File,
  onProgress?: (progress: number) => void
) {
  return new Promise<void>((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("PUT", url);
    for (const [name, value] of Object.entries(headers)) request.setRequestHeader(name, value);
    request.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress?.(Math.round((event.loaded / event.total) * 100));
    };
    request.onload = () => {
      if (request.status >= 200 && request.status < 300) resolve();
      else reject(new Error("No pudimos subir el archivo."));
    };
    request.onerror = () => reject(new Error("No pudimos subir el archivo."));
    request.send(file);
  });
}

export function getSupportedDocumentMimeType(file: Pick<File, "name" | "type">) {
  const extension = file.name.split(".").pop()?.toLowerCase();
  const byExtension: Record<string, string> = {
    pdf: "application/pdf",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    txt: "text/plain",
    md: "text/markdown",
    markdown: "text/markdown",
    html: "text/html",
    htm: "text/html",
    epub: "application/epub+zip",
  };
  const mime = extension ? byExtension[extension] : undefined;
  if (!mime) throw new Error("Formato no soportado. Usá PDF, DOCX, TXT, Markdown, HTML o EPUB.");
  return mime;
}

export function syncAgentProvider(avatarId: string) {
  return apiRequest<{ sync: ApiAgentProviderSync }>(`/avatars/${avatarId}/agent-provider/sync`, {
    method: "POST",
  });
}

export function startVoiceSession(avatarId: string) {
  return apiRequest<{ voiceSession: ApiVoiceSession }>(`/avatars/${avatarId}/voice-sessions`, {
    method: "POST",
  });
}

export function endVoiceSession(realtimeSessionId: string, transcript: VoiceSessionTranscriptEntry[]) {
  return apiRequest<{ voiceSession: EndedApiVoiceSession }>(`/voice-sessions/${realtimeSessionId}/end`, {
    method: "POST",
    body: JSON.stringify({ transcript }),
  });
}
