import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Boxes,
  ClipboardList,
  Edit3,
  LayoutDashboard,
  PackagePlus,
  Plus,
  RefreshCcw,
  ShoppingCart,
  Trash2,
  Users,
} from "lucide-react";
import { api } from "./api/client";
import "./styles.css";

const tabs = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "products", label: "Products", icon: Boxes },
  { id: "customers", label: "Customers", icon: Users },
  { id: "orders", label: "Orders", icon: ClipboardList },
];

const emptyProduct = { name: "", sku: "", price: "", quantity: "" };
const emptyCustomer = { full_name: "", email: "", phone: "" };

function App() {
  const [activeTab, setActiveTab] = useState("dashboard");
  const [summary, setSummary] = useState(null);
  const [products, setProducts] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [orders, setOrders] = useState([]);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [message, setMessage] = useState(null);
  const [loading, setLoading] = useState(false);

  async function refreshData() {
    setLoading(true);
    try {
      const [dashboardData, productData, customerData, orderData] = await Promise.all([
        api.getDashboard(),
        api.getProducts(),
        api.getCustomers(),
        api.getOrders(),
      ]);
      setSummary(dashboardData);
      setProducts(productData);
      setCustomers(customerData);
      setOrders(orderData);
    } catch (error) {
      showMessage(error.message, "error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refreshData();
  }, []);

  function showMessage(text, type = "success") {
    setMessage({ text, type });
    window.clearTimeout(showMessage.timer);
    showMessage.timer = window.setTimeout(() => setMessage(null), 4000);
  }

  const lowStockProducts = useMemo(
    () => products.filter((product) => Number(product.quantity) <= 5),
    [products],
  );

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <PackagePlus size={28} />
          <div>
            <strong>Ethara Inventory</strong>
            <span>Order Management</span>
          </div>
        </div>
        <nav className="nav-tabs" aria-label="Main sections">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                className={activeTab === tab.id ? "active" : ""}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                title={tab.label}
              >
                <Icon size={18} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </nav>
      </aside>

      <section className="content">
        <header className="topbar">
          <div>
            <h1>{tabs.find((tab) => tab.id === activeTab)?.label}</h1>
            <p>Manage products, customers, orders, and live inventory levels.</p>
          </div>
          <button className="icon-button" type="button" onClick={refreshData} title="Refresh data">
            <RefreshCcw size={18} />
            <span>{loading ? "Loading" : "Refresh"}</span>
          </button>
        </header>

        {message && <div className={`notice ${message.type}`}>{message.text}</div>}

        {activeTab === "dashboard" && (
          <Dashboard summary={summary} products={products} lowStockProducts={lowStockProducts} />
        )}
        {activeTab === "products" && (
          <Products
            products={products}
            refreshData={refreshData}
            showMessage={showMessage}
          />
        )}
        {activeTab === "customers" && (
          <Customers
            customers={customers}
            refreshData={refreshData}
            showMessage={showMessage}
          />
        )}
        {activeTab === "orders" && (
          <Orders
            orders={orders}
            customers={customers}
            products={products}
            selectedOrder={selectedOrder}
            setSelectedOrder={setSelectedOrder}
            refreshData={refreshData}
            showMessage={showMessage}
          />
        )}
      </section>
    </main>
  );
}

function Dashboard({ summary, products, lowStockProducts }) {
  const cards = [
    { label: "Products", value: summary?.total_products ?? 0, icon: Boxes },
    { label: "Customers", value: summary?.total_customers ?? 0, icon: Users },
    { label: "Orders", value: summary?.total_orders ?? 0, icon: ShoppingCart },
    { label: "Low Stock", value: summary?.low_stock_products ?? 0, icon: PackagePlus },
  ];

  return (
    <div className="stack">
      <div className="metric-grid">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <article className="metric-card" key={card.label}>
              <Icon size={24} />
              <span>{card.label}</span>
              <strong>{card.value}</strong>
            </article>
          );
        })}
      </div>

      <section className="panel">
        <div className="panel-header">
          <h2>Low Stock Products</h2>
        </div>
        <DataTable
          columns={["Name", "SKU", "Price", "Stock"]}
          rows={(lowStockProducts.length ? lowStockProducts : products.slice(0, 5)).map((product) => [
            product.name,
            product.sku,
            currency(product.price),
            product.quantity,
          ])}
          emptyText="No products yet."
        />
      </section>
    </div>
  );
}

function Products({ products, refreshData, showMessage }) {
  const [form, setForm] = useState(emptyProduct);
  const [editingId, setEditingId] = useState(null);

  function updateField(event) {
    setForm({ ...form, [event.target.name]: event.target.value });
  }

  async function submit(event) {
    event.preventDefault();
    try {
      const payload = {
        name: form.name.trim(),
        sku: form.sku.trim(),
        price: Number(form.price),
        quantity: Number(form.quantity),
      };
      if (editingId) {
        await api.updateProduct(editingId, payload);
        showMessage("Product updated successfully.");
      } else {
        await api.createProduct(payload);
        showMessage("Product added successfully.");
      }
      setForm(emptyProduct);
      setEditingId(null);
      await refreshData();
    } catch (error) {
      showMessage(error.message, "error");
    }
  }

  function startEdit(product) {
    setEditingId(product.id);
    setForm({
      name: product.name,
      sku: product.sku,
      price: product.price,
      quantity: product.quantity,
    });
  }

  async function remove(id) {
    try {
      await api.deleteProduct(id);
      showMessage("Product deleted.");
      await refreshData();
    } catch (error) {
      showMessage(error.message, "error");
    }
  }

  return (
    <div className="split-layout">
      <section className="panel">
        <div className="panel-header">
          <h2>{editingId ? "Update Product" : "Add Product"}</h2>
        </div>
        <form className="form-grid" onSubmit={submit}>
          <TextInput label="Product name" name="name" value={form.name} onChange={updateField} required />
          <TextInput label="SKU/code" name="sku" value={form.sku} onChange={updateField} required />
          <TextInput label="Price" name="price" type="number" step="0.01" min="0.01" value={form.price} onChange={updateField} required />
          <TextInput label="Quantity" name="quantity" type="number" min="0" value={form.quantity} onChange={updateField} required />
          <div className="form-actions">
            <button type="submit">
              <Plus size={18} />
              <span>{editingId ? "Save Product" : "Add Product"}</span>
            </button>
            {editingId && (
              <button className="secondary" type="button" onClick={() => { setForm(emptyProduct); setEditingId(null); }}>
                Cancel
              </button>
            )}
          </div>
        </form>
      </section>

      <section className="panel">
        <div className="panel-header">
          <h2>Product List</h2>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>SKU</th>
                <th>Price</th>
                <th>Stock</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {products.map((product) => (
                <tr key={product.id}>
                  <td>{product.name}</td>
                  <td>{product.sku}</td>
                  <td>{currency(product.price)}</td>
                  <td>{product.quantity}</td>
                  <td className="actions">
                    <button className="icon-only" type="button" title="Edit product" onClick={() => startEdit(product)}>
                      <Edit3 size={16} />
                    </button>
                    <button className="icon-only danger" type="button" title="Delete product" onClick={() => remove(product.id)}>
                      <Trash2 size={16} />
                    </button>
                  </td>
                </tr>
              ))}
              {!products.length && <EmptyRow colSpan={5} text="No products yet." />}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function Customers({ customers, refreshData, showMessage }) {
  const [form, setForm] = useState(emptyCustomer);

  function updateField(event) {
    setForm({ ...form, [event.target.name]: event.target.value });
  }

  async function submit(event) {
    event.preventDefault();
    try {
      await api.createCustomer({
        full_name: form.full_name.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
      });
      setForm(emptyCustomer);
      showMessage("Customer added successfully.");
      await refreshData();
    } catch (error) {
      showMessage(error.message, "error");
    }
  }

  async function remove(id) {
    try {
      await api.deleteCustomer(id);
      showMessage("Customer deleted.");
      await refreshData();
    } catch (error) {
      showMessage(error.message, "error");
    }
  }

  return (
    <div className="split-layout">
      <section className="panel">
        <div className="panel-header">
          <h2>Add Customer</h2>
        </div>
        <form className="form-grid" onSubmit={submit}>
          <TextInput label="Full name" name="full_name" value={form.full_name} onChange={updateField} required />
          <TextInput label="Email address" name="email" type="email" value={form.email} onChange={updateField} required />
          <TextInput label="Phone number" name="phone" value={form.phone} onChange={updateField} required />
          <div className="form-actions">
            <button type="submit">
              <Plus size={18} />
              <span>Add Customer</span>
            </button>
          </div>
        </form>
      </section>

      <section className="panel">
        <div className="panel-header">
          <h2>Customer List</h2>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Phone</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {customers.map((customer) => (
                <tr key={customer.id}>
                  <td>{customer.full_name}</td>
                  <td>{customer.email}</td>
                  <td>{customer.phone}</td>
                  <td className="actions">
                    <button className="icon-only danger" type="button" title="Delete customer" onClick={() => remove(customer.id)}>
                      <Trash2 size={16} />
                    </button>
                  </td>
                </tr>
              ))}
              {!customers.length && <EmptyRow colSpan={4} text="No customers yet." />}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function Orders({ orders, customers, products, selectedOrder, setSelectedOrder, refreshData, showMessage }) {
  const [customerId, setCustomerId] = useState("");
  const [productId, setProductId] = useState("");
  const [quantity, setQuantity] = useState(1);

  async function submit(event) {
    event.preventDefault();
    try {
      await api.createOrder({
        customer_id: Number(customerId),
        items: [{ product_id: Number(productId), quantity: Number(quantity) }],
      });
      setCustomerId("");
      setProductId("");
      setQuantity(1);
      showMessage("Order created and inventory updated.");
      await refreshData();
    } catch (error) {
      showMessage(error.message, "error");
    }
  }

  async function openOrder(id) {
    try {
      setSelectedOrder(await api.getOrder(id));
    } catch (error) {
      showMessage(error.message, "error");
    }
  }

  async function remove(id) {
    try {
      await api.deleteOrder(id);
      setSelectedOrder(null);
      showMessage("Order cancelled and stock restored.");
      await refreshData();
    } catch (error) {
      showMessage(error.message, "error");
    }
  }

  return (
    <div className="split-layout">
      <section className="panel">
        <div className="panel-header">
          <h2>Create Order</h2>
        </div>
        <form className="form-grid" onSubmit={submit}>
          <label>
            Customer
            <select value={customerId} onChange={(event) => setCustomerId(event.target.value)} required>
              <option value="">Select customer</option>
              {customers.map((customer) => (
                <option value={customer.id} key={customer.id}>{customer.full_name}</option>
              ))}
            </select>
          </label>
          <label>
            Product
            <select value={productId} onChange={(event) => setProductId(event.target.value)} required>
              <option value="">Select product</option>
              {products.map((product) => (
                <option value={product.id} key={product.id}>
                  {product.name} - stock {product.quantity}
                </option>
              ))}
            </select>
          </label>
          <TextInput label="Quantity" name="quantity" type="number" min="1" value={quantity} onChange={(event) => setQuantity(event.target.value)} required />
          <div className="form-actions">
            <button type="submit">
              <ShoppingCart size={18} />
              <span>Create Order</span>
            </button>
          </div>
        </form>

        {selectedOrder && (
          <div className="order-detail">
            <h3>Order #{selectedOrder.id}</h3>
            <p>{selectedOrder.customer.full_name} - {currency(selectedOrder.total_amount)}</p>
            {selectedOrder.items.map((item) => (
              <div className="line-item" key={item.id}>
                <span>{item.product.name}</span>
                <span>{item.quantity} x {currency(item.unit_price)}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="panel">
        <div className="panel-header">
          <h2>Orders</h2>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Customer</th>
                <th>Total</th>
                <th>Items</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => (
                <tr key={order.id}>
                  <td>#{order.id}</td>
                  <td>{order.customer.full_name}</td>
                  <td>{currency(order.total_amount)}</td>
                  <td>{order.items.length}</td>
                  <td className="actions">
                    <button className="small" type="button" onClick={() => openOrder(order.id)}>View</button>
                    <button className="icon-only danger" type="button" title="Cancel order" onClick={() => remove(order.id)}>
                      <Trash2 size={16} />
                    </button>
                  </td>
                </tr>
              ))}
              {!orders.length && <EmptyRow colSpan={5} text="No orders yet." />}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function TextInput({ label, ...props }) {
  return (
    <label>
      {label}
      <input {...props} />
    </label>
  );
}

function DataTable({ columns, rows, emptyText }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>{columns.map((column) => <th key={column}>{column}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={index}>
              {row.map((cell, cellIndex) => <td key={cellIndex}>{cell}</td>)}
            </tr>
          ))}
          {!rows.length && <EmptyRow colSpan={columns.length} text={emptyText} />}
        </tbody>
      </table>
    </div>
  );
}

function EmptyRow({ colSpan, text }) {
  return (
    <tr>
      <td className="empty-cell" colSpan={colSpan}>{text}</td>
    </tr>
  );
}

function currency(value) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(value || 0));
}

createRoot(document.getElementById("root")).render(<App />);
