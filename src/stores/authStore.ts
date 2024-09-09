import { defineStore } from 'pinia';
import { formatMessageDate, getSseBase, getUrlBase } from '../utils';
import { jwtDecode } from 'jwt-decode';
import axios from 'axios';
import { Chat, Message, User, Workspace } from '../types';

interface State {
    user: User | null,         // User information
    token: string | null,        // Authentication token
    workspace: Workspace | null,      // Current workspace
    channels: Chat[],       // List of channels
    messages: Map<number, Message[]>,       // Messages hashmap, keyed by channel ID
    users: Map<number, User>,         // Users hashmap under workspace, keyed by user ID
    activeChannel: Chat | null,
    sse: EventSource | null,
}

export const useAuthStore = defineStore('authStore', {
  state: (): State => ({
    user: getStoredUser(),         // User information
    token: getStoredToken(),        // Authentication token
    workspace: getStoredWorkspace(),      // Current workspace
    channels: getStoredChannels(),       // List of channels
    messages: getStoredMessages(),       // Messages hashmap, keyed by channel ID
    users: getStoredUsers(),         // Users hashmap under workspace, keyed by user ID
    activeChannel: null as Chat | null,
    sse: null as EventSource | null,
  }),

  // Method
  actions: {
    setSSE() {
      const sseBase = getSseBase();
      const url = `${sseBase}?access_token=${this.token}`;
      const sse = new EventSource(url);

      sse.addEventListener("NewMessage", (e) => {
        const data = JSON.parse(e.data);
        console.log('new message:', e.data);
        delete data.event;
        const message = data as Message;
        this.addMessage(data.chatId, message)
      });

      sse.onmessage = (event) => {
        console.log('got event:', event);
      };

      sse.onerror = (error) => {
        console.error('EventSource failed:', error);
        sse.close();
      };

      this.sse = sse
    },
    setUser(user: User) {
      this.user = user;
    },
    setToken(token: string) {
      this.token = token;
    },
    setWorkspace(workspace: Workspace) {
      this.workspace = workspace;
    },
    setChannels(channels: Chat[]) {
      this.channels = channels;
    },
    setUsers(users: Map<number, User>) {
      this.users = users
    },

    setMessages(channelId: number, messages: Message[]) {
      // Format the date for each message before setting them in the state
      const formattedMessages = messages.map(message => ({
        id: message.id,
        chatId: message.chatId,
        senderId: message.senderId,
        content: message.content,
        files: message.files,
        createdAt: message.createdAt,
        formattedCreatedAt: formatMessageDate(message.createdAt),
      }));
      this.messages.set(channelId, formattedMessages.reverse())
    },
    addChannel(channel: Chat) {
      this.channels.push(channel);
      this.messages.set(channel.id, []);  // Initialize message list for the new channel

      // Update the channels and messages in local storage
      localStorage.setItem('channels', JSON.stringify(this.channels));
      localStorage.setItem('messages', JSON.stringify(Object.fromEntries(this.messages)));
    },
    addMessage(channelId: number, message: Message) {
      if (this.messages.has(channelId)) {
        // Format the message date before adding it to the state
        message.formattedCreatedAt = formatMessageDate(message.createdAt);
        const msg = this.messages.get(channelId)!
        msg.push(message);
        this.messages.set(channelId, msg)
      } else {
        message.formattedCreatedAt = formatMessageDate(message.createdAt);
        this.messages.set(channelId, [message])
      }
    },
    setActiveChannel(channelId: number) {
      const channel = this.channels.find((c) => c.id === channelId)!;
      this.activeChannel = channel;
    },

    closeSSE() {
      if (this.sse) {
        this.sse.close()
        this.sse = null
      }
    },

    async loadState(token: string) {
      const user: User = jwtDecode(token); // Decode the JWT to get user info
      const workspace: Workspace = { id: user.wsId, name: user.wsName, ownerId: 0, createdAt: '' };

      try {
        // fetch all workspace users
        const usersResp = await axios.get(`${getUrlBase()}/users`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        console.log(usersResp)
        const users: User[] = usersResp.data.map((user: any) => {
          return {
            id: user.id,
            wsId: 0,
            wsName: 0,
            fullname: user.fullname,
            email: user.email,
            createdAt: ''
          }
        });
        const usersMap = new Map<number, User>();
        users.forEach((u) => {
          usersMap.set(u.id, u)
        });
        console.log(usersMap, JSON.stringify(Object.fromEntries(usersMap)))

        // fetch all my channels
        const chatsResp = await axios.get(`${getUrlBase()}/chats`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
        const channels = chatsResp.data as Chat[];


        // Store user info, token, and workspace in localStorage
        localStorage.setItem('user', JSON.stringify(user));
        localStorage.setItem('token', token);
        localStorage.setItem('workspace', JSON.stringify(workspace));
        localStorage.setItem('users', JSON.stringify(Object.fromEntries(usersMap)));
        localStorage.setItem('channels', JSON.stringify(channels));

        // Commit the mutations to update the state
        this.setUser(user)
        this.setToken(token)
        this.setWorkspace(workspace)
        this.setChannels(channels)
        this.setUsers(usersMap)

        // call initSSE action
        this.setSSE()

        return user;
      } catch (error) {
        console.error('Failed to load user state:', error);
        throw error;
      }
    },

    async signup(data: {email: string, fullname: string, password: string, workspace: string}) {
      try {
        const response = await axios.post(`${getUrlBase()}/signup`, data);
        const user = await this.loadState(response.data.token);

        return user;
      } catch (error) {
        console.error('Signup failed:', error);
        throw error;
      }
    },

    async signin(data: {email: string, password: string}) {
      try {
        const response = await axios.post(`${getUrlBase()}/signin`, data);

        const user = await this.loadState(response.data.token);
        return user;
      } catch (error) {
        console.error('Login failed:', error);
        throw error;
      }
    },

    logout() {
      // Clear local storage and state
      localStorage.removeItem('user');
      localStorage.removeItem('token');
      localStorage.removeItem('workspace');
      localStorage.removeItem('channels');
      localStorage.removeItem('messages');
      this.user = null
      this.token = null
      this.workspace = null
      this.channels = []
      this.messages = new Map([])
      // close SSE
      this.closeSSE()
      location.reload()
    },

    async fetchMessagesForChannel(channelId: number) {
      if (!this.messages.get(channelId) || this.messages.get(channelId)!.length === 0) {
        try {
          const response = await axios.get(`${getUrlBase()}/chats/${channelId}/messages?limit=10`, {
            headers: {
              Authorization: `Bearer ${this.token}`,
            },
          });
          const messages = response.data;
          // messages = messages.map((message) => {
          //   const user = state.users[message.senderId];
          //   return {
          //     ...message,
          //     sender: user,
          //   };
          // } );
          this.setMessages(channelId, messages)
        } catch (error) {
          console.error(`Failed to fetch messages for channel ${channelId}:`, error);
        }
      }
    },

    async sendMessage(payload: {chatId: number, content: string}) {
      try {
        const response = await axios.post(`${getUrlBase()}/chats/${payload.chatId}`, payload, {
          headers: {
            Authorization: `Bearer ${this.token}`,
          },
        });
        console.log('sendMessage:', response.data);
        // commit('addMessage', { channelId: payload.chatId, message: response.data });
      } catch (error) {
        console.error('Failed to send message:', error);
        throw error;
      }
    },

  },

  // Computed
  getters: {
    isAuthenticatedl(state: State) {
      return !!state.token;
    },
    getUser(state: State) {
      return state.user;
    },
    getUserById: (state) => (id: number) => {
      return state.users.get(id) || null
    },
    getWorkspace(state) {
      return state.workspace;
    },

    getWorkspaceName(state) {
      return state.workspace?.name;
    },
    getChannels(state) {
      // filter out channels that type == 'single'
      return state.channels.filter((channel) => channel.type !== 'single');
    },
    getSingleChannels(state: State) {
      const channels =  state.channels.filter((channel) => channel.type === 'single');
      // return channel member that is not myself
      return channels.map((channel) => {
        const id = channel.members.find((id) => id !== state.user!.id)!;

        channel.recipient = (state.users as Map<number, User>).get(id) || null;
        return channel;
      });
    },
    getChannelMessages: (state) => (channelId: number) => {
      return state.messages.get(channelId) || [];
    },
    getMessagesForActiveChannel(state) {
      if (!state.activeChannel) {
        return [];
      }
      return state.messages.get(state.activeChannel.id) || [];
    },
  },
});

const getStoredUser = () => {
  const storedUser = localStorage.getItem('user');
  if (storedUser) {
    return JSON.parse(storedUser) as User;
  }
  return null
}

const getStoredToken = () => {
  const storedToken = localStorage.getItem('token');
  return storedToken
}

const getStoredWorkspace = () => {
  const storedWorkspace = localStorage.getItem('workspace');
      if (storedWorkspace) {
        return JSON.parse(storedWorkspace) as Workspace;
      }
      return null
}

const getStoredChannels = (): Chat[] => {
  const storedChannels = localStorage.getItem('channels');
      if (storedChannels) {
        return JSON.parse(storedChannels) as Chat[];
      }
      return []
}

const getStoredMessages = (): Map<number, Message[]> => {
  const storedMessages = localStorage.getItem('messages');
      if (storedMessages) {
        // Parse the JSON string to an object
        const parsedObject: Record<number, Message[]> = JSON.parse(storedMessages);
        // Convert the object to a Map
        return new Map<number, Message[]>(Object.entries(parsedObject).map(([key, value]) => [Number(key), value]));
      }
      return new Map()
}

const getStoredUsers = (): Map<number, User> => {
  const storedUsers = localStorage.getItem('users');
  if (storedUsers) {
    // Parse the JSON string to an object
    const parsedObject: Record<number, User> = JSON.parse(storedUsers);
    // Convert the object to a Map
    return new Map<number, User>(Object.entries(parsedObject).map(([key, value]) => [Number(key), value]));
  }
  return new Map()
}

