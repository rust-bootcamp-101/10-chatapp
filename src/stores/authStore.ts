import { defineStore } from 'pinia';
import { formatMessageDate, getSseBase, getUrlBase } from '../utils';
import { jwtDecode } from 'jwt-decode';
import axios from 'axios';
import { Chat, Message, User, Workspace } from '../types';

export const useAuthStore = defineStore('auth', {
  state: () => ({
    user: null as User | null,         // User information
    token: null as string | null,        // Authentication token
    workspace: null as Workspace | null,      // Current workspace
    channels: [] as Chat[],       // List of channels
    messages: {} as Map<number, Message[]>,       // Messages hashmap, keyed by channel ID
    users: {} as Map<number, User>,         // Users hashmap under workspace, keyed by user ID
    activeChannel: null as Chat | null,
    sse: null as EventSource | null,
  }),

  // Method
  actions: {
    setSSE() {
      const sseBase = getSseBase();
      const url = `${sseBase}?token=${this.token}`;
      const sse = new EventSource(url);

      sse.addEventListener("NewMessage", (e) => {
        const data = JSON.parse(e.data);
        console.log('message:', e.data);
        delete data.event;
        this.addMessage(data.chatId, data)
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
    setChannels(channels: any) {
      this.channels = channels;
    },
    setUsers(users: Map<number, User>) {
      this.users = users
    },

    setMessages(channelId: number, messages: Message[]) {
      // Format the date for each message before setting them in the state
      const formattedMessages = messages.map(message => ({
        ...message,
        formattedCreatedAt: formatMessageDate(message.createdAt)
      }));
      this.messages.set(channelId, formattedMessages.reverse())
    },
    addChannel(channel: Chat) {
      this.channels.push(channel);
      this.messages.set(channel.id, []);  // Initialize message list for the new channel

      // Update the channels and messages in local storage
      localStorage.setItem('channels', JSON.stringify(this.channels));
      localStorage.setItem('messages', JSON.stringify(this.messages));
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
    loadUserState() {
      const storedUser = localStorage.getItem('user');
      const storedToken = localStorage.getItem('token');
      const storedWorkspace = localStorage.getItem('workspace');
      const storedChannels = localStorage.getItem('channels');
      // we do not store messages in local storage, so this is always empty
      const storedMessages = localStorage.getItem('messages');
      const storedUsers = localStorage.getItem('users');

      if (storedUser) {
        this.user = JSON.parse(storedUser);
      }
      if (storedToken) {
        this.token = storedToken;
      }
      if (storedWorkspace) {
        this.workspace = JSON.parse(storedWorkspace);
      }
      if (storedChannels) {
        this.channels = JSON.parse(storedChannels);
      }
      if (storedMessages) {
        this.messages = JSON.parse(storedMessages);
      }
      if (storedUsers) {
        this.users = JSON.parse(storedUsers);
      }
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
        const users: User[] = usersResp.data;
        const usersMap = new Map<number, User>();
        users.forEach((u) => {
          usersMap.set(u.id, u)
        });

        // fetch all my channels
        const chatsResp = await axios.get(`${getUrlBase()}/chats`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
        const channels = chatsResp.data;


        // Store user info, token, and workspace in localStorage
        localStorage.setItem('user', JSON.stringify(user));
        localStorage.setItem('token', token);
        localStorage.setItem('workspace', JSON.stringify(workspace));
        localStorage.setItem('users', JSON.stringify(usersMap));
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
      this.messages = new Map()
      // close SSE
      this.closeSSE()
    },

    async fetchMessagesForChannel(channelId: number) {
      if (!this.messages.get(channelId) || this.messages.get(channelId)!.length === 0) {
        try {
          const response = await axios.get(`${getUrlBase()}/chats/${channelId}/messages`, {
            headers: {
              Authorization: `Bearer ${this.token}`,
            },
          });
        let messages = response.data;
          // messages = messages.map((message) => {
          //   const user = state.users[message.senderId];
          //   return {
          //     ...message,
          //     sender: user,
          //   };
          // } );
          await this.sendMessage({chatId: channelId, messages })
        } catch (error) {
          console.error(`Failed to fetch messages for channel ${channelId}:`, error);
        }
      }
    },

    async sendMessage(payload: {chatId: number, messages: Message[]}) {
      try {
        const response = await axios.post(`${getUrlBase()}/chats/${payload.chatId}`, payload, {
          headers: {
            Authorization: `Bearer ${this.token}`,
          },
        });
        console.log('Message sent:', response.data);
        // commit('addMessage', { channelId: payload.chatId, message: response.data });
      } catch (error) {
        console.error('Failed to send message:', error);
        throw error;
      }
    },

  },

  // Computed
  getters: {
    isAuthenticated(state) {
      return !!state.token;
    },
    getUser(state) {
      return state.user;
    },
    getUserById: (state) => (id: number) => {
      return state.users.get(id)
    },
    getWorkspace(state) {
      return state.workspace;
    },
    getChannels(state) {
      // filter out channels that type == 'single'
      return state.channels.filter((channel) => channel.type !== 'single');
    },
    getSingChannels(state) {
      const channels =  state.channels.filter((channel) => channel.type === 'single');
      // return channel member that is not myself
      return channels.map((channel) => {
        const id = channel.members.find((id) => id !== state.user!.id)!;
        channel.recipient = state.users.get(id)!;
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

