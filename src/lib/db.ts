import Dexie, { Table } from "dexie";
import { ChatMessage, ChatThread, VirtualFile } from "@/types";

class CuratorDB extends Dexie {
  files!: Table<VirtualFile, string>;
  chat_threads!: Table<ChatThread, string>;
  chat_messages!: Table<ChatMessage, string>;

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
  }
}

export const db = new CuratorDB();
