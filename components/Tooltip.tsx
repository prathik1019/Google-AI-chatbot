
import React from 'react';

interface TooltipProps {
  text: string;
  children: React.ReactNode;
}

export const Tooltip: React.FC<TooltipProps> = ({ text, children }) => {
  return (
    <div className="relative group flex justify-center">
      {children}
      <div 
        className="absolute top-full mt-2 whitespace-nowrap bg-black text-white text-sm font-semibold px-3 py-1.5 rounded-full shadow-lg 
                   opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"
        role="tooltip"
      >
        {text}
      </div>
    </div>
  );
};
