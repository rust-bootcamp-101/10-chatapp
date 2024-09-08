
<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useAuthStore } from '../stores/authStore';
import { useRouter } from 'vue-router';

const authStore = useAuthStore()
const dropdownVisible = ref(false)
const router = useRouter()
const root = ref<HTMLElement | null>(null)

// computed
const workspaceName = computed(() => authStore.getWorkspaceName || 'No Workspace')
const channels = computed(() => authStore.getChannels)
const activeChannelId = computed(() => authStore.activeChannel && authStore.activeChannel.id)
const singleChannels = computed(() => authStore.getSingleChannels)

// methods
const toggleDropdown = () => dropdownVisible.value = !dropdownVisible.value
const logout = () => {
  authStore.logout()
  router.push("/login")
}
const addChannel = () => {
  // const newChannel: Chat = {
  //   id: Date.now().toString(),
  //   name: `Channel ${channels.value.length + 1}`,
  //   ownerId: 0,
  //   createdAt: ''
  // };
  // authStore.addChannel(newChannel)
}

const selectChannel = (channelId: number) => {
  authStore.setActiveChannel(channelId)
}

const handleOutsideClick = (event: MouseEvent) => {
  if (!root.value?.contains(event.target as HTMLInputElement)) {
    dropdownVisible.value = false;
  }
}

// hook
onMounted(() => {
  document.addEventListener('click', handleOutsideClick);
})

onBeforeUnmount(() => {
  document.removeEventListener('click', handleOutsideClick);
})

</script>

<template>
  <div ref="root" class="w-64 bg-gray-800 text-white flex flex-col h-screen p-4 text-sm">
    <div class="flex items-center justify-between mb-6">
      <div class="font-bold text-base truncate cursor-pointer" @click="toggleDropdown">
        <span>{{ workspaceName }}</span>
        <button class="text-gray-400 ml-1">&nbsp;▼</button>
      </div>
      <div v-if="dropdownVisible" class="absolute top-12 left-0 w-48 bg-gray-800 border border-gray-700 rounded-md shadow-lg z-10">
        <ul class="py-1">
          <li @click="logout" class="px-4 py-2 hover:bg-gray-700 cursor-pointer">Logout</li>
          <!-- Add more dropdown items here as needed -->
        </ul>
      </div>
      <button @click="addChannel" class="text-gray-400 text-xl hover:text-white">+</button>
    </div>

    <div class="mb-6">
      <h2 class="text-xs uppercase text-gray-400 mb-2">Channels</h2>
      <ul>
        <li v-for="channel in channels" :key="channel.id" @click="selectChannel(channel.id)"
            :class="['px-2 py-1 rounded cursor-pointer', { 'bg-blue-600': channel.id === activeChannelId }]">
          # {{ channel.name }}
        </li>
      </ul>
    </div>

    <div>
      <h2 class="text-xs uppercase text-gray-400 mb-2">Direct Messages</h2>
      <ul>
        <li v-for="channel in singleChannels" :key="channel.id" @click="selectChannel(channel.id)"
            :class="['flex items-center px-2 py-1 rounded cursor-pointer', { 'bg-blue-600': channel.id === activeChannelId }]">
          <img :src="`https://ui-avatars.com/api/?name=${channel.recipient!.fullname.replace(' ', '+')}`"
               class="w-6 h-6 rounded-full mr-2" alt="Avatar" />
          {{ channel.recipient!.fullname }}
        </li>
      </ul>
    </div>
  </div>
</template>