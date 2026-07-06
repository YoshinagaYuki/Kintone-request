import { STATUS_LABELS, type RequestStatus } from "@/types/request";

const STYLES: Record<RequestStatus, { badge: string; dot: string }> = {
  pending: { badge: "bg-yellow-100 text-yellow-800", dot: "bg-yellow-500" },
  approved: { badge: "bg-blue-100 text-blue-800", dot: "bg-blue-500" },
  registered: { badge: "bg-green-100 text-green-800", dot: "bg-green-500" },
  register_failed: { badge: "bg-red-100 text-red-800", dot: "bg-red-500" },
  rejected: { badge: "bg-gray-200 text-gray-700", dot: "bg-gray-500" },
};

export function StatusBadge({ status }: { status: RequestStatus }) {
  const style = STYLES[status];
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ${style.badge}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${style.dot}`} aria-hidden="true" />
      {STATUS_LABELS[status]}
    </span>
  );
}
