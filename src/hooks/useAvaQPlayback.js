import { useCallback, useRef, useState } from 'react';
import { avaqApiClient } from '../services/avaqApiClient';

export function useAvaQPlayback({ avatarImagePath, voiceId }) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [videoSrc, setVideoSrc] = useState('');
  const audioRef = useRef(null);

  const play = useCallback(async (text) => {
    setIsPlaying(true);
    try {
      const clip = await avaqApiClient.generateAvatarVideo({
        phrase: text,
        avatarImagePath,
        voiceId,
      });

      const clipPath = clip?.videoPath;
      if (clipPath) {
        const url = `/api/avaq/avatar/clip?path=${encodeURIComponent(clipPath)}`;
        setVideoSrc(url);
      }

      const audio = await avaqApiClient.synthesizeVoice(text);
      const objectUrl = URL.createObjectURL(audio);
      if (audioRef.current) {
        audioRef.current.pause();
      }
      const tag = new Audio(objectUrl);
      audioRef.current = tag;
      await tag.play();
    } finally {
      setIsPlaying(false);
    }
  }, [avatarImagePath, voiceId]);

  return { isPlaying, videoSrc, play };
}
