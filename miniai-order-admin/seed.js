function seedOrders() {
  return [
    {
      id: "10482",
      customer: "Nguyễn Thu Hà",
      phone: "0901000001",
      address: "Nha Trang",
      amount: 6200000,
      shippingFee: 25000,
      payment: "Chuyển khoản",
      carrier: "Chưa chọn",
      status: "pending",
      cancelReason: "",
      items: [{ name: "Loa MiniAI", quantity: 1, price: 6200000 }],
    },
    {
      id: "10481",
      customer: "Trần Minh Khoa",
      phone: "0901000002",
      address: "Hà Nội",
      amount: 7400000,
      shippingFee: 30000,
      payment: "COD",
      carrier: "GHN",
      status: "shipping",
      cancelReason: "",
      items: [{ name: "Tai nghe MiniAI", quantity: 2, price: 3700000 }],
    },
    {
      id: "10479",
      customer: "Lê Hoàng Anh",
      phone: "0901000003",
      address: "Đà Nẵng",
      amount: 5000000,
      shippingFee: 20000,
      payment: "Đã thanh toán",
      carrier: "GHTK",
      status: "delivered",
      cancelReason: "",
      items: [{ name: "Mic MiniAI", quantity: 1, price: 5000000 }],
    },
  ];
}

module.exports = { seedOrders };
