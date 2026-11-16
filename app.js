import { Search, ShoppingBag, Menu, X, MessageCircle, ShieldCheck, Truck, User, LogOut, Plus, Minus, ArrowLeft, Smartphone } from "https://cdn.jsdelivr.net/npm/lucide@latest/dist/esm/lucide.js";

const config = window.APP_CONFIG || {};
const settings = {
  whatsapp: (config.WHATSAPP_NUMBER || "").replace(/\D/g, ""),
  mpesaNumber: config.MPESA_NUMBER || "0757787383",
  mpesaRecipient: config.MPESA_RECIPIENT || "Uncle Ben Oraimo",
  currency: config.CURRENCY || "KES"
};

const supabaseConfigured = Boolean(
  config.SUPABASE_URL &&
  config.SUPABASE_URL.startsWith("https://") &&
  !config.SUPABASE_URL.includes("YOUR_") &&
  config.SUPABASE_ANON_KEY &&
  !config.SUPABASE_ANON_KEY.includes("YOUR_")
);
const supabaseReady = supabaseConfigured && Boolean(window.supabase?.createClient);
const supabase = supabaseReady
  ? window.supabase.createClient(config.SUPABASE_URL, config.SUPABASE_ANON_KEY)
  : null;

const money = n => `${settings.currency} ${Number(n || 0).toLocaleString("en-KE")}`;

const fallbackProducts = [
  {id:"demo-1",name:"Oraimo FreePods",category:"Audio",price:2500,description:"True wireless earbuds for everyday listening.",image_url:"https://images.unsplash.com/photo-1606220945770-b5b6c2c55bf1?w=900",stock:20},
  {id:"demo-2",name:"Oraimo Power Bank",category:"Power",price:3200,description:"Portable power for your devices on the go.",image_url:"https://images.unsplash.com/photo-1609091839311-d5365f9ff1c5?w=900",stock:15},
  {id:"demo-3",name:"Oraimo Smart Watch",category:"Smart Devices",price:4500,description:"Stay connected and keep track of your activity.",image_url:"https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=900",stock:10},
  {id:"demo-4",name:"Oraimo Headphones",category:"Audio",price:3800,description:"Comfortable headphones with rich sound.",image_url:"https://images.unsplash.com/photo-1509316785289-025f5b846b35?w=900",stock:8},
  {id:"demo-5",name:"Oraimo Charging Cable",category:"Power",price:650,description:"Durable cable for convenient charging.",image_url:"https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=900",stock:30},
  {id:"demo-6",name:"Oraimo Grooming Trimmer",category:"Personal Care",price:2100,description:"A practical grooming accessory.",image_url:"https://images.unsplash.com/photo-1621607512214-68297480165e?w=900",stock:12}
];

// App State
let state = {
  products: [],
  loading: true,
  category: "All",
  query: "",
  cart: {},
  page: "shop",
  selected: null,
  drawer: false,
  order: null,
  tracking: "",
  trackResult: null,
  trackError: "",
  notice: "",
  session: null,
  adminEmail: "",
  adminPassword: "",
  adminOrders: [],
  adminProducts: [],
  paymentOrder: null
};

async function init() {
  if (supabase) {
    const { data } = await supabase.auth.getSession();
    state.session = data.session;
    supabase.auth.onAuthStateChange((_e, s) => {
      state.session = s;
      render();
    });
  }
  await loadProducts();
}

async function loadProducts() {
  state.loading = true;
  render();
  if (!supabaseReady) {
    state.products = fallbackProducts;
    state.loading = false;
    render();
    return;
  }
  const { data, error } = await supabase.from("products").select("*").eq("is_active", true).order("created_at", { ascending: false });
  if (error) {
    state.notice = "Could not load products. Check your Supabase setup.";
    state.products = fallbackProducts;
  } else {
    state.products = data || [];
  }
  state.loading = false;
  render();
}

async function loadAdmin() {
  if (!supabase) return;
  const [o, p] = await Promise.all([
    supabase.from("orders").select("*,order_items(*),payments(*)").order("created_at", { ascending: false }).limit(100),
    supabase.from("products").select("*").order("created_at", { ascending: false })
  ]);
  if (o.error) state.notice = o.error.message; else state.adminOrders = o.data || [];
  if (!p.error) state.adminProducts = p.data || [];
  render();
}

function navigate(p) {
  state.page = p;
  state.drawer = false;
  window.scrollTo(0, 0);
  render();
}

function addToCart(p) {
  state.cart[p.id] = (state.cart[p.id] || 0) + 1;
  state.notice = `${p.name} added to cart`;
  render();
}

function changeQty(id, delta) {
  const n = (state.cart[id] || 0) + delta;
  if (n <= 0) delete state.cart[id];
  else state.cart[id] = n;
  render();
}

function whatsappOrder() {
  const cartItems = state.products.filter(p => state.cart[p.id]).map(p => ({ ...p, qty: state.cart[p.id] }));
  const total = cartItems.reduce((s, p) => s + Number(p.price) * p.qty, 0);
  if (!settings.whatsapp) { state.notice = "Add your WhatsApp number in config.js first."; render(); return; }
  const lines = cartItems.map(p => `• ${p.name} x${p.qty} — ${money(p.price * p.qty)}`).join("\n");
  const msg = `Hello Uncle Ben Oraimo, I would like to order:\n${lines}\n\nTotal: ${money(total)}\nPlease confirm availability and delivery.`;
  window.open(`https://wa.me/${settings.whatsapp}?text=${encodeURIComponent(msg)}`, "_blank");
}

async function placeOrder(e) {
  e.preventDefault();
  const fd = new FormData(e.target);
  const cartItems = state.products.filter(p => state.cart[p.id]).map(p => ({ ...p, qty: state.cart[p.id] }));
  const payload = {
    customer_name: fd.get("name"),
    phone: fd.get("phone"),
    email: fd.get("email") || null,
    delivery_address: fd.get("address"),
    delivery_notes: fd.get("notes") || null,
    payment_method: fd.get("payment"),
    items: cartItems.map(p => ({ product_id: p.id, quantity: p.qty }))
  };
  if (!supabaseReady) { state.notice = "Connect Supabase and deploy the create-order function before placing live orders."; render(); return; }
  const { data, error } = await supabase.functions.invoke("create-order", { body: payload });
  if (error || !data?.order) { state.notice = data?.error || error?.message || "Could not place order."; render(); return; }
  
  state.order = data.order;
  state.paymentOrder = data.order;
  state.cart = {};
  
  if (payload.payment_method === "whatsapp") {
    if (settings.whatsapp) {
      const lines = cartItems.map(p => `• ${p.name} x${p.qty} — ${money(p.price * p.qty)}`).join("\n");
      const msg = `Hello Uncle Ben Oraimo, I placed order ${data.order.order_number}.\n${lines}\nTotal: ${money(data.order.total_amount)}\nName: ${payload.customer_name}\nPhone: ${payload.phone}\nDelivery: ${payload.delivery_address}\nPlease confirm my order and payment instructions.`;
      window.open(`https://wa.me/${settings.whatsapp}?text=${encodeURIComponent(msg)}`, "_blank");
      state.tracking = data.order.order_number;
      navigate("tracking");
    } else {
      state.notice = "Set your WhatsApp number in config.js.";
      state.tracking = data.order.order_number;
      navigate("tracking");
    }
  } else {
    navigate("payment");
  }
}

async function submitPayment(e) {
  e.preventDefault();
  const fd = new FormData(e.target);
  const sms = String(fd.get("sms") || "").trim();
  if (!sms) { state.notice = "Paste the full M-Pesa confirmation message."; render(); return; }
  
  const { data, error } = await supabase.functions.invoke("submit-payment", { body: { order_id: state.paymentOrder.id, confirmation_message: sms } });
  if (error || data?.error) { state.notice = data?.error || error?.message || "Could not submit payment."; render(); return; }
  
  state.notice = "Payment confirmation submitted. Your order is awaiting admin verification.";
  state.tracking = state.paymentOrder.order_number;
  navigate("tracking");
}

async function trackOrder(e) {
  e.preventDefault();
  state.trackError = "";
  state.trackResult = null;
  render();
  if (!supabaseReady) { state.trackError = "Connect Supabase to track live orders."; render(); return; }
  const { data, error } = await supabase.functions.invoke("track-order", { body: { order_number: state.tracking.trim() } });
  if (error || data?.error) { state.trackError = data?.error || "Order not found. Check the order number."; render(); return; }
  state.trackResult = data.order;
  render();
}

async function adminLogin(e) {
  e.preventDefault();
  if (!supabase) {
    state.notice = "Configure Supabase in config.js before using the admin dashboard.";
    render();
    return;
  }
  const { error } = await supabase.auth.signInWithPassword({ email: state.adminEmail, password: state.adminPassword });
  if (error) { state.notice = error.message; render(); return; }
  navigate("admin");
  loadAdmin();
}

async function adminUpdate(table, id, values) {
  const { error } = await supabase.from(table).update(values).eq("id", id);
  if (error) { state.notice = error.message; render(); return; }
  if (table === "orders" && values.payment_status) {
    const status = values.payment_status === "approved" ? "approved" : values.payment_status === "rejected" ? "rejected" : "pending";
    await supabase.from("payments").update({ status, reviewed_by: state.session.user.id, reviewed_at: new Date().toISOString() }).eq("order_id", id);
  }
  state.notice = "Updated successfully.";
  loadAdmin();
}

async function addProduct(e) {
  e.preventDefault();
  const fd = new FormData(e.target);
  const row = {
    name: fd.get("name"),
    category: fd.get("category"),
    description: fd.get("description"),
    price: Number(fd.get("price")),
    image_url: fd.get("image_url"),
    stock: Number(fd.get("stock")),
    is_active: true
  };
  const { error } = await supabase.from("products").insert(row);
  if (error) state.notice = error.message;
  else {
    e.target.reset();
    loadAdmin();
    loadProducts();
    state.notice = "Product added.";
  }
  render();
}

async function signOut() {
  await supabase.auth.signOut();
  state.session = null;
  navigate("shop");
}

function render() {
  const app = document.getElementById("app");
  const categories = ["All", ...new Set(state.products.map(p => p.category).filter(Boolean))];
  const shown = state.products.filter(p => (state.category === "All" || p.category === state.category) && (`${p.name} ${p.category} ${p.description || ""}`).toLowerCase().includes(state.query.toLowerCase()));
  const cartItems = state.products.filter(p => state.cart[p.id]).map(p => ({ ...p, qty: state.cart[p.id] }));
  const total = cartItems.reduce((s, p) => s + Number(p.price) * p.qty, 0);
  const cartCount = Object.values(state.cart).reduce((a, b) => a + b, 0);

  let mainContent = "";

  if (state.page === "shop") {
    mainContent = `
      <section class="hero">
        <div class="hero-copy">
          <span class="eyebrow">WELCOME TO UNCLE BEN ORAIMO</span>
          <h1>Make every day<br/><em>smarter.</em></h1>
          <p>Discover audio, power, smart devices and lifestyle accessories in one place.</p>
          <div class="hero-actions">
            <button class="btn primary" id="explore-btn">Explore products</button>
            <button class="btn outline" id="hero-track-btn">Track an order</button>
          </div>
          <div class="trust">
            <span>🛡️ Carefully selected products</span>
            <span>🚚 Delivery available</span>
          </div>
        </div>
        <div class="hero-art">
          <div class="hero-circle"></div>
          <img src="https://images.unsplash.com/photo-1608156639585-b3a032ef9689?w=1100" alt="Wireless audio accessories"/>
        </div>
      </section>
      <main id="products" class="section">
        <div class="section-heading">
          <div>
            <span class="eyebrow">OUR COLLECTION</span>
            <h2>Find your next favourite.</h2>
          </div>
          <div class="search">
            🔍 <input id="search-input" value="${state.query}" placeholder="Search products..."/>
          </div>
        </div>
        <div class="categories">
          ${categories.map(c => `<button class="${state.category === c ? 'active' : ''}" data-category="${c}">${c}</button>`).join("")}
        </div>
        ${state.loading ? `<p>Loading products…</p>` : `
          <div class="product-grid">
            ${shown.map(p => `
              <article class="product-card">
                <button class="product-image" data-view-product="${p.id}">
                  <img src="${p.image_url || 'https://placehold.co/600x450?text=Oraimo'}" alt="${p.name}"/>
                  <span>View details</span>
                </button>
                <div class="product-info">
                  <small>${p.category}</small>
                  <h3>${p.name}</h3>
                  <p>${p.description}</p>
                  <div class="product-bottom">
                    <b>${money(p.price)}</b>
                    <button class="add-btn" data-add-id="${p.id}">➕ Add</button>
                  </div>
                </div>
              </article>
            `).join("")}
          </div>
        `}
        ${!shown.length && !state.loading ? `<div class="empty">No products found. Try another search.</div>` : ""}
      </main>
      <section class="benefits">
        <div><b>🛡️ Trusted shopping</b><span>Clear product details and order records.</span></div>
        <div><b>🚚 Delivery support</b><span>Delivery details confirmed with you.</span></div>
        <div><b>💬 Personal assistance</b><span>Reach us through WhatsApp.</span></div>
      </section>
    `;
  } else if (state.page === "product" && state.selected) {
    const p = state.selected;
    mainContent = `
      <main class="section">
        <button class="back" id="back-shop">⬅ Back to shop</button>
        <div class="product-detail">
          <img src="${p.image_url}" alt="${p.name}"/>
          <div>
            <span class="eyebrow">${p.category}</span>
            <h1>${p.name}</h1>
            <h2>${money(p.price)}</h2>
            <p>${p.description}</p>
            <p class="stock">${p.stock > 0 ? `Available: ${p.stock}` : "Contact us for availability"}</p>
            <button class="btn primary" id="detail-add-btn">Add to cart</button>
            <button class="btn outline" id="detail-cart-btn">View cart</button>
          </div>
        </div>
      </main>
    `;
  } else if (state.page === "cart") {
    mainContent = `
      <main class="section narrow">
        <span class="eyebrow">YOUR SELECTION</span>
        <h1>Shopping cart</h1>
        ${!cartItems.length ? `
          <div class="empty">Your cart is empty. <button class="text-btn" id="empty-shop-btn">Continue shopping</button></div>
        ` : `
          <div class="cart-list">
            ${cartItems.map(p => `
              <div class="cart-row" key="${p.id}">
                <img src="${p.image_url}" alt=""/>
                <div class="cart-name">
                  <b>${p.name}</b>
                  <small>${money(p.price)} each</small>
                </div>
                <div class="qty">
                  <button data-qty-dec="${p.id}">-</button>
                  <span>${p.qty}</span>
                  <button data-qty-inc="${p.id}">+</button>
                </div>
                <b>${money(p.price * p.qty)}</b>
              </div>
            `).join("")}
          </div>
          <div class="total-line">
            <span>Subtotal</span>
            <b>${money(total)}</b>
          </div>
          <p class="muted">Delivery charges, if any, will be confirmed before dispatch.</p>
          <button class="btn primary full" id="proceed-checkout-btn">Proceed to checkout</button>
          <button class="btn whatsapp full" id="whatsapp-order-btn">💬 Order via WhatsApp instead</button>
        `}
      </main>
    `;
  } else if (state.page === "checkout") {
    mainContent = `
      <main class="section narrow">
        <span class="eyebrow">ALMOST THERE</span>
        <h1>Delivery & checkout</h1>
        <div class="checkout-summary" style="background:var(--surface);border:1px solid var(--border);padding:1.5rem;border-radius:var(--radius);margin-bottom:1.5rem;">
          <b>Order summary</b>
          ${cartItems.map(p => `<div style="display:flex;justify-content:space-between;margin-top:8px;font-size:0.9rem;"><span>${p.name} × ${p.qty}</span><span>${money(p.price * p.qty)}</span></div>`).join("")}
          <div class="total-line" style="margin:1rem 0 0;padding-top:1rem;">
            <b>Total</b>
            <b>${money(total)}</b>
          </div>
        </div>
        <form class="form" id="checkout-form">
          <label>Full name<input name="name" required minlength="2" placeholder="Your name"/></label>
          <label>Phone number<input name="phone" required placeholder="07XX XXX XXX"/></label>
          <label>Email (optional)<input name="email" type="email" placeholder="you@example.com"/></label>
          <label>Delivery address<input name="address" required placeholder="Town, estate, building or pickup point"/></label>
          <label>Delivery notes (optional)<textarea name="notes" placeholder="Landmark or delivery instructions"></textarea></label>
          <label>Payment method
            <select name="payment">
              <option value="mpesa_send_money">M-Pesa Send Money</option>
              <option value="whatsapp">Confirm via WhatsApp</option>
            </select>
          </label>
          <button class="btn primary full" type="submit">Place order · ${money(total)}</button>
          <p class="tiny">Placing an order does not mean payment has been approved. Admin verifies M-Pesa confirmation before processing.</p>
        </form>
      </main>
    `;
  } else if (state.page === "payment" && state.paymentOrder) {
    mainContent = `
      <main class="section narrow">
        <div class="success-icon">📱</div>
        <span class="eyebrow">ORDER RECEIVED</span>
        <h1>Complete your M-Pesa payment</h1>
        <div class="order-number">Order ${state.paymentOrder.order_number}</div>
        <div class="payment-instructions">
          <b>Send ${money(state.paymentOrder.total_amount)} via M-Pesa Send Money</b>
          <p>Recipient: <strong>${settings.mpesaRecipient}</strong></p>
          <p>Send to: <strong>${settings.mpesaNumber}</strong></p>
          <p>After paying, paste the complete M-Pesa confirmation SMS below. Your order remains pending until an admin verifies it.</p>
        </div>
        <form class="form" id="payment-form">
          <label>Paste full M-Pesa confirmation message
            <textarea name="sms" required rows="4" placeholder="e.g. QABC123XYZ Confirmed. Ksh... sent to ..."></textarea>
          </label>
          <button class="btn primary full">Submit payment confirmation</button>
        </form>
        <button class="text-btn" id="later-track-btn" style="display:block;margin:1rem auto 0;">I'll do this later · Track order</button>
      </main>
    `;
  } else if (state.page === "tracking") {
    mainContent = `
      <main class="section narrow">
        <span class="eyebrow">ORDER UPDATES</span>
        <h1>Track your order</h1>
        <p class="muted">Enter the order number shown after checkout.</p>
        <form class="track-form" id="track-form">
          <input id="track-input" value="${state.tracking}" placeholder="e.g. UB-2026-ABC123" required/>
          <button class="btn primary">Track</button>
        </form>
        ${state.trackError ? `<p class="error">${state.trackError}</p>` : ""}
        ${state.trackResult ? `
          <div class="tracking-card">
            <div class="tracking-head">
              <b>${state.trackResult.order_number}</b>
              <span class="status ${state.trackResult.status}">${state.trackResult.status.replaceAll("_", " ")}</span>
            </div>
            <p>Payment: <b>${state.trackResult.payment_status}</b></p>
            <p>Order date: ${new Date(state.trackResult.created_at).toLocaleString()}</p>
            <p>Total: <b>${money(state.trackResult.total_amount)}</b></p>
            <p>${state.trackResult.status === "dispatched" || state.trackResult.status === "delivered" ? `Your order is ${state.trackResult.status}.` : "We will update your order as it moves through processing and delivery."}</p>
          </div>
        ` : ""}
      </main>
    `;
  } else if (state.page === "contact") {
    mainContent = `
      <main class="section narrow">
        <span class="eyebrow">WE'RE HERE TO HELP</span>
        <h1>Contact Uncle Ben Oraimo</h1>
        <p>Questions about products, delivery or an order? Chat with us on WhatsApp.</p>
        <button class="btn whatsapp full" id="contact-whatsapp-btn" style="margin-top:1.5rem;">💬 Chat on WhatsApp</button>
      </main>
    `;
  } else if (state.page === "admin") {
    mainContent = `
      <main class="section admin">
        <span class="eyebrow">STORE MANAGEMENT</span>
        <h1>Admin dashboard</h1>
        {!state.session ? `
          <form class="form admin-login" id="admin-login-form">
            <label>Admin email<input type="email" id="admin-email" value="${state.adminEmail}" required/></label>
            <label>Password<input type="password" id="admin-password" value="${state.adminPassword}" required/></label>
            <button class="btn primary">Sign in</button>
          </form>
        ` : `
          <div class="admin-top">
            <p>Signed in as ${state.session.user.email}</p>
            <div>
              <button class="btn outline" id="admin-refresh-btn" style="margin-right:8px;">Refresh</button>
              <button class="btn outline" id="admin-signout-btn">Sign out</button>
            </div>
          </div>
          <h2>Orders & payments</h2>
          <div class="admin-table">
            ${state.adminOrders.map(o => `
              <div class="admin-order" key="${o.id}">
                <div>
                  <b>${o.order_number}</b>
                  <small>${o.customer_name} · ${o.phone}</small>
                  <small>${(o.order_items || []).map(i => `${i.product_name} ×${i.quantity}`).join(", ")}</small>
                  <small>${money(o.total_amount)} · ${o.payment_method}</small>
                  ${(o.payments || []).map(p => `<blockquote>${p.confirmation_message}</blockquote>`).join("")}
                </div>
                <div>
                  <span class="status ${o.payment_status}">${o.payment_status}</span>
                  <span class="status ${o.status}">${o.status}</span>
                  <select data-order-payment="${o.id}" style="margin-top:6px;width:100%;">
                    <option value="unpaid" ${o.payment_status === 'unpaid' ? 'selected' : ''}>Unpaid</option>
                    <option value="pending_verification" ${o.payment_status === 'pending_verification' ? 'selected' : ''}>Pending verification</option>
                    <option value="approved" ${o.payment_status === 'approved' ? 'selected' : ''}>Approve payment</option>
                    <option value="rejected" ${o.payment_status === 'rejected' ? 'selected' : ''}>Reject payment</option>
                  </select>
                  <select data-order-status="${o.id}" style="margin-top:6px;width:100%;">
                    <option value="pending" ${o.status === 'pending' ? 'selected' : ''}>Pending</option>
                    <option value="confirmed" ${o.status === 'confirmed' ? 'selected' : ''}>Confirmed</option>
                    <option value="processing" ${o.status === 'processing' ? 'selected' : ''}>Processing</option>
                    <option value="dispatched" ${o.status === 'dispatched' ? 'selected' : ''}>Dispatched</option>
                    <option value="delivered" ${o.status === 'delivered' ? 'selected' : ''}>Delivered</option>
                    <option value="cancelled" ${o.status === 'cancelled' ? 'selected' : ''}>Cancelled</option>
                  </select>
                </div>
              </div>
            `).join("")}
          </div>
          <h2>Products</h2>
          <form class="product-admin-form" id="add-product-form">
            <input name="name" placeholder="Product name" required/>
            <input name="category" placeholder="Category" required/>
            <input name="price" type="number" min="0" placeholder="Price (KES)" required/>
            <input name="stock" type="number" min="0" placeholder="Stock" required/>
            <input name="image_url" placeholder="Image URL"/>
            <textarea name="description" placeholder="Description"></textarea>
            <button class="btn primary">Add product</button>
          </form>
          <div class="admin-table">
            ${state.adminProducts.map(p => `
              <div class="admin-product" key="${p.id}">
                <span>${p.name} · ${money(p.price)}</span>
                <button class="btn outline" data-toggle-product="${p.id}" data-active="${p.is_active}">${p.is_active ? "Hide" : "Publish"}</button>
              </div>
            `).join("")}
          </div>
        `}
      </main>
    `;
  }

  app.innerHTML = `
    <div class="app">
      <header class="topbar">
        <div class="brand" id="nav-shop">
          <span class="brand-mark">UB</span>
          <span>UNCLE BEN <b>ORAIMO</b><small>SMART TECHNOLOGY. BETTER LIVING.</small></span>
        </div>
        <nav class="desktop-nav">
          <button class="${state.page === 'shop' ? 'active' : ''}" id="nav-shop-desktop">Shop</button>
          <button class="${state.page === 'tracking' ? 'active' : ''}" id="nav-track-desktop">Track order</button>
          <button class="${state.page === 'contact' ? 'active' : ''}" id="nav-contact-desktop">Contact</button>
          <button class="${state.page === 'admin' ? 'active' : ''}" id="nav-admin-desktop">Admin</button>
        </nav>
        <div class="head-actions">
          <button class="icon-btn" id="nav-cart-btn" aria-label="Cart">
            🛒 <i>${cartCount}</i>
          </button>
          <button class="icon-btn mobile-menu" id="mobile-menu-toggle">☰</button>
        </div>
      </header>
      ${state.drawer ? `
        <div class="mobile-drawer">
          <button id="m-shop">Shop</button>
          <button id="m-track">Track order</button>
          <button id="m-contact">Contact</button>
          <button id="m-admin">Admin</button>
        </div>
      ` : ""}
      ${state.notice ? `
        <div class="notice" id="close-notice">${state.notice} ✕</div>
      ` : ""}
      ${mainContent}
      <footer>
        <div class="brand" id="footer-shop">
          <span class="brand-mark">UB</span>
          <span>UNCLE BEN <b>ORAIMO</b><small>SMART TECHNOLOGY. BETTER LIVING.</small></span>
        </div>
        <p>Quality accessories. Convenient shopping. Personal service.</p>
        <div class="footer-links">
          <button id="f-shop">Shop</button>
          <button id="f-track">Track order</button>
          <button id="f-contact">Contact</button>
          <button id="f-admin">Admin</button>
        </div>
        <small>© ${new Date().getFullYear()} Uncle Ben Oraimo. Product names and trademarks belong to their respective owners.</small>
      </footer>
      <button class="floating-cart" id="floating-cart-btn">🛒 Cart (${cartCount})</button>
    </div>
  `;

  attachEvents();
}

function attachEvents() {
  // Navigation
  document.querySelectorAll("#nav-shop, #nav-shop-desktop, #m-shop, #f-shop, #footer-shop").forEach(el => el?.addEventListener("click", () => navigate("shop")));
  document.querySelectorAll("#nav-track-desktop, #m-track, #f-track, #hero-track-btn").forEach(el => el?.addEventListener("click", () => navigate("tracking")));
  document.querySelectorAll("#nav-contact-desktop, #m-contact, #f-contact").forEach(el => el?.addEventListener("click", () => navigate("contact")));
  document.querySelectorAll("#nav-admin-desktop, #m-admin, #f-admin").forEach(el => el?.addEventListener("click", () => { navigate("admin"); if (state.session) loadAdmin(); }));
  document.getElementById("nav-cart-btn")?.addEventListener("click", () => navigate("cart"));
  document.getElementById("floating-cart-btn")?.addEventListener("click", () => navigate("cart"));
  document.getElementById("mobile-menu-toggle")?.addEventListener("click", () => { state.drawer = !state.drawer; render(); });
  document.getElementById("close-notice")?.addEventListener("click", () => { state.notice = ""; render(); });
  document.getElementById("explore-btn")?.addEventListener("click", () => document.getElementById("products")?.scrollIntoView({ behavior: "smooth" }));

  // Search & Categories
  document.getElementById("search-input")?.addEventListener("input", e => {
    const cursor = e.target.selectionStart;
    state.query = e.target.value;
    render();
    const refreshed = document.getElementById("search-input");
    refreshed?.focus();
    if (refreshed && cursor !== null) refreshed.setSelectionRange(cursor, cursor);
  });
  document.querySelectorAll(".categories button").forEach(btn => {
    btn.addEventListener("click", () => { state.category = btn.getAttribute("data-category"); render(); });
  });

  // Product Actions
  document.querySelectorAll("[data-view-product]").forEach(btn => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-view-product");
      state.selected = state.products.find(p => p.id === id);
      navigate("product");
    });
  });
  document.querySelectorAll("[data-add-id]").forEach(btn => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-add-id");
      const p = state.products.find(x => x.id === id);
      if (p) addToCart(p);
    });
  });

  // Product detail
  document.getElementById("back-shop")?.addEventListener("click", () => navigate("shop"));
  document.getElementById("detail-add-btn")?.addEventListener("click", () => { if (state.selected) addToCart(state.selected); });
  document.getElementById("detail-cart-btn")?.addEventListener("click", () => navigate("cart"));

  // Cart
  document.getElementById("empty-shop-btn")?.addEventListener("click", () => navigate("shop"));
  document.querySelectorAll("[data-qty-dec]").forEach(btn => {
    btn.addEventListener("click", () => changeQty(btn.getAttribute("data-qty-dec"), -1));
  });
  document.querySelectorAll("[data-qty-inc]").forEach(btn => {
    btn.addEventListener("click", () => changeQty(btn.getAttribute("data-qty-inc"), 1));
  });
  document.getElementById("proceed-checkout-btn")?.addEventListener("click", () => navigate("checkout"));
  document.getElementById("whatsapp-order-btn")?.addEventListener("click", whatsappOrder);

  // Forms
  document.getElementById("checkout-form")?.addEventListener("submit", placeOrder);
  document.getElementById("payment-form")?.addEventListener("submit", submitPayment);
  document.getElementById("later-track-btn")?.addEventListener("click", () => { state.tracking = state.paymentOrder.order_number; navigate("tracking"); });
  document.getElementById("track-form")?.addEventListener("submit", trackOrder);
  document.getElementById("contact-whatsapp-btn")?.addEventListener("click", () => {
    if (settings.whatsapp) window.open(`https://wa.me/${settings.whatsapp}?text=${encodeURIComponent("Hello Uncle Ben Oraimo, I need assistance.")}`, "_blank");
    else { state.notice = "Set WhatsApp number in config.js"; render(); }
  });

  // Admin
  document.getElementById("admin-email")?.addEventListener("input", e => { state.adminEmail = e.target.value; });
  document.getElementById("admin-password")?.addEventListener("input", e => { state.adminPassword = e.target.value; });
  document.getElementById("admin-login-form")?.addEventListener("submit", adminLogin);
  document.getElementById("admin-signout-btn")?.addEventListener("click", signOut);
  document.getElementById("admin-refresh-btn")?.addEventListener("click", loadAdmin);
  document.getElementById("add-product-form")?.addEventListener("submit", addProduct);

  document.querySelectorAll("[data-order-payment]").forEach(sel => {
    sel.addEventListener("change", e => adminUpdate("orders", sel.getAttribute("data-order-payment"), { payment_status: e.target.value, ...(e.target.value === 'approved' ? { status: 'confirmed' } : {}) }));
  });
  document.querySelectorAll("[data-order-status]").forEach(sel => {
    sel.addEventListener("change", e => adminUpdate("orders", sel.getAttribute("data-order-status"), { status: e.target.value }));
  });
  document.querySelectorAll("[data-toggle-product]").forEach(btn => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-toggle-product");
      const active = btn.getAttribute("data-active") === "true";
      adminUpdate("products", id, { is_active: !active });
    });
  });
}

init();