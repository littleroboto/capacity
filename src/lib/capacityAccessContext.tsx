import type { ReactNode } from 'react';
import { createContext, useContext } from 'react';
import { FULL_CAPACITY_ACCESS, type CapacityAccess } from '@/lib/capacityAccess';

const CapacityAccessContext = createContext<CapacityAccess>(FULL_CAPACITY_ACCESS);

export function FullCapacityAccessProvider({ children }: { children: ReactNode }) {
  return (
    <CapacityAccessContext.Provider value={FULL_CAPACITY_ACCESS}>{children}</CapacityAccessContext.Provider>
  );
}

export function CapacityAccessBridgeProvider({
  value,
  children,
}: {
  value: CapacityAccess;
  children: ReactNode;
}) {
  return <CapacityAccessContext.Provider value={value}>{children}</CapacityAccessContext.Provider>;
}

export function useCapacityAccess(): CapacityAccess {
  return useContext(CapacityAccessContext);
}
