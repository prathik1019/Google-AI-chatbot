
import React from 'react';
import type { Suggestion } from '../types';

interface SuggestionChipProps {
  suggestion: Suggestion;
  onClick: () => void;
}

export const SuggestionChip: React.FC<SuggestionChipProps> = ({ suggestion, onClick }) => {
  const Icon = suggestion.icon;
  return (
    <button
      onClick={onClick}
      className="px-4 py-2 bg-[#1E1F20] text-gray-300 rounded-full border border-gray-700/50 shadow-sm hover:bg-[#2a2a2a] hover:border-gray-600 transition-all duration-300 ease-in-out focus:outline-none focus:ring-2 focus:ring-gray-600 text-sm flex items-center gap-2"
    >
      {/* Defensively render icon only if it exists to prevent app crash */}
      {Icon && <Icon className="w-4 h-4" />}
      {suggestion.text}
    </button>
  );
};
