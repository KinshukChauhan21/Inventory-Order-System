const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    ...options,
  });

  if (response.status === 204) {
    return null;
  }

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message = Array.isArray(data.detail)
      ? data.detail.map((item) => item.msg).join(", ")
      : data.detail || "Something went wrong";
    throw new Error(message);
  }

  return data;
}

export const api = {
  getDashboard: () => request("/dashboard"),
  getProducts: () => request("/products"),
  createProduct: (payload) =>
    request("/products", { method: "POST", body: JSON.stringify(payload) }),
  updateProduct: (id, payload) =>
    request(`/products/${id}`, { method: "PUT", body: JSON.stringify(payload) }),
  deleteProduct: (id) => request(`/products/${id}`, { method: "DELETE" }),
  getCustomers: () => request("/customers"),
  createCustomer: (payload) =>
    request("/customers", { method: "POST", body: JSON.stringify(payload) }),
  deleteCustomer: (id) => request(`/customers/${id}`, { method: "DELETE" }),
  getOrders: () => request("/orders"),
  getOrder: (id) => request(`/orders/${id}`),
  createOrder: (payload) => request("/orders", { method: "POST", body: JSON.stringify(payload) }),
  deleteOrder: (id) => request(`/orders/${id}`, { method: "DELETE" }),
};
