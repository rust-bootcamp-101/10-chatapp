export type User = {
  id: number,
  wsId: number, // workspace_id
  wsName: string,
  fullname: string,
  email: string,
  createdAt: string,
}

export type Workspace = {
  id: number,
  name: string,
  ownerId: number,
  createdAt: string,
}

export type ChatUser = {
  id: number,
  fullname: string,
  email: string,
}

export type Chat = {
  id: number,
  wsId: number,
  name: string | null,
  type: ChatType,
  members: number[],
  createdAt: string,
  recipient: User | null
}

export type ChatType = "single" | "group" |"privateChannel"| "publicChannel"

export type Message = {
  id: number,
  chatId: number,
  senderId: number,
  content: string,
  files: string[],
  createdAt: string,
  formattedCreatedAt: string,
}