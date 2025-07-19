import React, { createContext, useContext, useState } from 'react';

const DragContext = createContext();

export const useDrag = () => {
  const context = useContext(DragContext);
  if (!context) {
    throw new Error('useDrag must be used within a DragProvider');
  }
  return context;
};

export const DragProvider = ({ children }) => {
  const [draggedItem, setDraggedItem] = useState(null);
  const [dragOverTarget, setDragOverTarget] = useState(null);

  const startDrag = (item) => {
    setDraggedItem(item);
  };

  const endDrag = () => {
    setDraggedItem(null);
    setDragOverTarget(null);
  };

  const setDragOver = (target) => {
    setDragOverTarget(target);
  };

  const clearDragOver = () => {
    setDragOverTarget(null);
  };

  const value = {
    draggedItem,
    dragOverTarget,
    startDrag,
    endDrag,
    setDragOver,
    clearDragOver,
  };

  return (
    <DragContext.Provider value={value}>
      {children}
    </DragContext.Provider>
  );
};

export default DragContext;