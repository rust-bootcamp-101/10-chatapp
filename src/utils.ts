import { invoke } from '@tauri-apps/api/core';

const URL_BASE = 'http://localhost:6688/api';
const SSE_URL = 'http://localhost:6687/events';

type Config = {
  server: {
    chat: string,
    notification: string
  }
}

let config: Config | null = null;
try {
  if (invoke) {
    config = await invoke('get_config') as Config;
  }
} catch (error) {
  console.warn('failed to get config: fallback');
}

export const getUrlBase = () => {
  if (config && config.server.chat) {
    return config.server.chat;
  }
  return URL_BASE;
}

export const getSseBase = () => {
  if (config && config.server.notification) {
    return config.server.notification;
  }
  return SSE_URL;
}


export function formatMessageDate(timestamp: string) {
  const date = new Date(timestamp);
  const now = new Date();
  const diffDays = Math.floor((now.valueOf() - date.valueOf()) / (1000 * 60 * 60 * 24));
  const timeString = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  if (diffDays === 0) {
    return timeString;
  } else if (diffDays < 30) {
    return `${timeString}, ${diffDays} ${diffDays === 1 ? 'day' : 'days'} ago`;
  } else {
    return `${timeString}, ${date.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}`;
  }
}