import Dexie, { Table } from "dexie";
import { ChatMessage, ChatThread, LlmUsageRecord, VirtualFile } from "@/types";

class CuratorDB extends Dexie {
  files!: Table<VirtualFile, string>;
  chat_threads!: Table<ChatThread, string>;
  chat_messages!: Table<ChatMessage, string>;
  llm_usage!: Table<LlmUsageRecord, string>;

  constructor() {
    super("CuratorAIDB");

    this.version(1).stores({
      files: "id,&path,parentPath,type",
    });

    this.version(2).stores({
      files: "id,&path,parentPath,type",
      chat_threads: "id,updatedAt",
      chat_messages: "id,threadId,timestamp",
    });

    this.version(3).stores({
      files: "id,&path,parentPath,type",
      chat_threads: "id,updatedAt",
      chat_messages: "id,threadId,timestamp",
      llm_usage: "id,timestamp,provider,model,context,usageSource",
    });
  }
}

export const db = new CuratorDB();
