import { FlowTape } from "../components/FlowTape";
import type { FlowEvent } from "../types";

interface Props {
  flowEvents: FlowEvent[];
  underlying: string;
}

export function FlowView({ flowEvents, underlying }: Props) {
  return (
    <div className="h-full flex flex-col">
      <FlowTape events={flowEvents} underlying={underlying} />
    </div>
  );
}
