"use client";

import React from "react";
import { Card } from "./Card";

export interface AvatarOption {
  id: string;
  name: string;
  thumbnail?: string;
}

export interface AvatarSelectorProps {
  selectedAvatarId?: string;
  avatars?: AvatarOption[];
  onSelect?: (avatarId: string) => void;
  showPreview?: boolean;
}

/**
 * Avatar Selector Component
 * Allows selecting an avatar from a list with preview
 */
export function AvatarSelector({
  selectedAvatarId,
  avatars = [],
  onSelect,
  showPreview = true,
}: AvatarSelectorProps) {
  const defaultAvatars: AvatarOption[] = [
    { id: "1", name: "Avatar personalizado 1" },
    { id: "2", name: "Avatar personalizado 2" },
    { id: "3", name: "Avatar personalizado 3" },
  ];

  const avatarList = avatars.length > 0 ? avatars : defaultAvatars;

  return (
    <div className="space-y-4">
      <label className="block text-sm font-medium text-white mb-2">
        Avatar
      </label>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {avatarList.map((avatar) => (
          <Card
            key={avatar.id}
            variant="bordered"
            padding="md"
            className={`
              cursor-pointer transition-all duration-200
              ${selectedAvatarId === avatar.id 
                ? "border-[#D365FF] ring-2 ring-[#D365FF] ring-opacity-50" 
                : "hover:border-white/30"
              }
            `}
            onClick={() => onSelect?.(avatar.id)}
          >
            <div className="aspect-square mb-3 rounded-lg bg-white/5 flex items-center justify-center">
              <div className="w-16 h-16 rounded-full gradient-primary" />
            </div>
            <p className="text-sm font-medium text-white text-center">
              {avatar.name}
            </p>
            {selectedAvatarId === avatar.id && (
              <div className="mt-2 flex items-center justify-center gap-2 text-[#D365FF] text-xs">
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                  <path
                    fillRule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                    clipRule="evenodd"
                  />
                </svg>
                Selected
              </div>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}

