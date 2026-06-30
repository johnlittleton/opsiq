const AVATAR_LIST_KEY = 'avaq.avatars';
const AVATAR_ACTIVE_KEY = 'avaq.avatar.activeId';
const AVATAR_CONFIG_KEY = 'avaq.avatar.config';

function safeParse(value, fallback) {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

function readList() {
  return safeParse(localStorage.getItem(AVATAR_LIST_KEY), []);
}

function writeList(list) {
  localStorage.setItem(AVATAR_LIST_KEY, JSON.stringify(list));
}

function readConfig() {
  return safeParse(localStorage.getItem(AVATAR_CONFIG_KEY), {
    activeAvatarId: null,
    provider: 'browser',
    updatedAt: Date.now(),
  });
}

function writeConfig(config) {
  localStorage.setItem(AVATAR_CONFIG_KEY, JSON.stringify(config));
}

function id() {
  return `avaq_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

async function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Failed to read avatar image'));
    reader.readAsDataURL(file);
  });
}

export const avatarStorageService = {
  async saveAvatarFile(file) {
    if (!file || !file.type.startsWith('image/')) {
      throw new Error('Please upload a PNG or JPG image.');
    }

    const dataUrl = await fileToDataUrl(file);
    const nextAvatar = {
      id: id(),
      name: file.name,
      mimeType: file.type,
      dataUrl,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    const list = readList();
    const nextList = [nextAvatar, ...list].slice(0, 8);
    writeList(nextList);
    this.setActiveAvatar(nextAvatar.id);
    return nextAvatar;
  },

  getAvatars() {
    return readList();
  },

  deleteAvatar(avatarId) {
    const list = readList().filter((avatar) => avatar.id !== avatarId);
    writeList(list);
    const activeAvatarId = localStorage.getItem(AVATAR_ACTIVE_KEY);
    if (activeAvatarId === avatarId) {
      const nextActive = list[0]?.id || null;
      this.setActiveAvatar(nextActive);
    }
    return list;
  },

  setActiveAvatar(avatarId) {
    if (!avatarId) {
      localStorage.removeItem(AVATAR_ACTIVE_KEY);
    } else {
      localStorage.setItem(AVATAR_ACTIVE_KEY, avatarId);
    }
    const config = readConfig();
    writeConfig({ ...config, activeAvatarId: avatarId || null, updatedAt: Date.now() });
  },

  getActiveAvatar() {
    const list = readList();
    const activeId = localStorage.getItem(AVATAR_ACTIVE_KEY) || readConfig().activeAvatarId;
    if (!activeId) return list[0] || null;
    return list.find((avatar) => avatar.id === activeId) || list[0] || null;
  },

  getConfig() {
    return readConfig();
  },

  saveConfig(partialConfig) {
    const next = { ...readConfig(), ...partialConfig, updatedAt: Date.now() };
    writeConfig(next);
    if (Object.prototype.hasOwnProperty.call(partialConfig, 'activeAvatarId')) {
      this.setActiveAvatar(partialConfig.activeAvatarId);
    }
    return next;
  },
};
