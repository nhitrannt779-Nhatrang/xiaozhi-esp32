const STATUSES = ["pending", "shipping", "delivered", "cancelled"];

const STATUS_LABELS = {
  pending: "Chờ xác nhận",
  shipping: "Đang giao",
  delivered: "Đã giao hàng",
  cancelled: "Đã hủy",
};

const NEXT_STATUS = {
  pending: "shipping",
  shipping: "delivered",
};

function assertAdmin(role) {
  if (role !== "admin") {
    const error = new Error("Chỉ admin được thao tác đơn hàng");
    error.status = 403;
    throw error;
  }
}

function rejectWrite(message) {
  const error = new Error(message);
  error.status = 403;
  throw error;
}

function changeStatus(order, nextStatus, reason) {
  if (!STATUSES.includes(nextStatus)) {
    const error = new Error("Trạng thái không hợp lệ");
    error.status = 400;
    throw error;
  }
  if (order.status === "delivered" || order.status === "cancelled") {
    rejectWrite("Đơn đã kết thúc, không đổi trạng thái");
  }
  if (nextStatus === "cancelled") {
    if (!reason || !String(reason).trim()) {
      const error = new Error("Hủy đơn cần lý do");
      error.status = 400;
      throw error;
    }
    return { ...order, status: "cancelled", cancelReason: String(reason).trim() };
  }
  if (NEXT_STATUS[order.status] !== nextStatus) {
    rejectWrite("Chỉ chuyển chờ xác nhận → đang giao → đã giao, hoặc hủy kèm lý do");
  }
  return { ...order, status: nextStatus };
}

module.exports = {
  STATUSES,
  STATUS_LABELS,
  assertAdmin,
  rejectWrite,
  changeStatus,
};
