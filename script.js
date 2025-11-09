/* Get references to DOM elements */
const categoryFilter = document.getElementById("categoryFilter");
const productSearch = document.getElementById("productSearch");
const productsContainer = document.getElementById("productsContainer");
const chatForm = document.getElementById("chatForm");
const chatWindow = document.getElementById("chatWindow");
const generateRoutineBtn = document.getElementById("generateRoutine");
const selectedProductsListEl = document.getElementById("selectedProductsList");

/* This is your Cloudflare Worker endpoint (it holds the real OpenAI API key).
  The site will POST messages to this endpoint which proxies requests to OpenAI. */
const workerEndpoint = "https://green-glade-add1.ahinkofe.workers.dev/";

/* In-memory caches */
let allProducts = [];
let selectedProductIds = JSON.parse(
  localStorage.getItem("selectedProductIds") || "[]"
);

// Simple debounce helper to avoid too-frequent filtering while typing
function debounce(fn, wait) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn.apply(this, args), wait);
  };
}

/* Show initial placeholder until user selects a category */
productsContainer.innerHTML = `
  <div class="placeholder-message">
    Select a category to view products
  </div>
`;

/* Load product data from JSON file */
async function loadProducts() {
  const response = await fetch("products.json");
  const data = await response.json();
  return data.products;
}

/* Create HTML for displaying product cards */
function displayProducts(products) {
  productsContainer.innerHTML = products
    .map((product) => {
      const isSelected = selectedProductIds.includes(product.id);
      return `
    <div class="product-card ${isSelected ? "selected" : ""}" data-id="${
        product.id
      }">
      <img src="${product.image}" alt="${product.name}">
      <div class="product-info">
        <h3>${product.name}</h3>
        <p>${product.brand}</p>
        <div style="margin-top:8px;display:flex;gap:8px;align-items:center">
          <button class="desc-toggle" data-id="${
            product.id
          }" aria-expanded="false" aria-controls="desc-${
        product.id
      }">Description</button>
        </div>
        <div id="desc-${product.id}" class="product-desc" aria-hidden="true">${
        product.description
      }</div>
      </div>
    </div>
  `;
    })
    .join("");
}

/* Filter and display products when category changes */
// Combined filter: category + search query
async function filterAndDisplay() {
  const selectedCategory = categoryFilter ? categoryFilter.value : "";
  const query = productSearch ? productSearch.value.trim().toLowerCase() : "";

  if (!allProducts || allProducts.length === 0) {
    allProducts = await loadProducts();
  }

  // If no filters provided, show placeholder
  if (
    (!query || query.length === 0) &&
    (!selectedCategory || selectedCategory === "")
  ) {
    productsContainer.innerHTML = `
      <div class="placeholder-message">
        Select a category or search to view products
      </div>
    `;
    return;
  }

  const filteredProducts = allProducts.filter((product) => {
    // category filter (if set)
    const categoryMatch =
      !selectedCategory ||
      selectedCategory === "" ||
      product.category === selectedCategory;

    // search filter (if set) - check name, brand, category, description
    const searchMatch =
      !query ||
      product.name.toLowerCase().includes(query) ||
      (product.brand && product.brand.toLowerCase().includes(query)) ||
      (product.category && product.category.toLowerCase().includes(query)) ||
      (product.description &&
        product.description.toLowerCase().includes(query));

    return categoryMatch && searchMatch;
  });

  displayProducts(filteredProducts);
}

// Wire category change and search input to the combined filter
if (categoryFilter)
  categoryFilter.addEventListener("change", () => { filterAndDisplay(); updateCategoryStyle(); });
if (productSearch)
  productSearch.addEventListener(
    "input",
    debounce(() => filterAndDisplay(), 180)
  );

// Update select's visual style when default (empty) option is selected
function updateCategoryStyle() {
  if (!categoryFilter) return;
  if (!categoryFilter.value || categoryFilter.value === "") {
    categoryFilter.classList.add("all-selected");
  } else {
    categoryFilter.classList.remove("all-selected");
  }
}

// ensure initial style reflects the current value
updateCategoryStyle();

/* ------------------ Product selection + persistence ------------------ */
function saveSelectedIds() {
  localStorage.setItem(
    "selectedProductIds",
    JSON.stringify(selectedProductIds)
  );
}

function renderSelectedProducts() {
  selectedProductsListEl.innerHTML = "";
  if (!selectedProductIds || selectedProductIds.length === 0) {
    selectedProductsListEl.innerHTML = `<div class="placeholder-message">No products selected yet.</div>`;
    return;
  }

  selectedProductIds.forEach((id) => {
    const product = allProducts.find((p) => p.id === id);
    if (!product) return; // skip if not found (shouldn't happen)

    const item = document.createElement("div");
    item.className = "selected-item";
    item.innerHTML = `
      <img src="${product.image}" alt="${product.name}" style="width:48px;height:48px;object-fit:contain;margin-right:8px;" />
      <div style="flex:1">
        <div style="font-size:14px;font-weight:600">${product.name}</div>
        <div style="font-size:12px;color:#666">${product.brand}</div>
      </div>
      <button class="remove-selected" data-id="${product.id}" aria-label="Remove ${product.name}" style="margin-left:8px;background:#fff;border:1px solid #ccc;border-radius:6px;padding:6px 8px;cursor:pointer">✕</button>
    `;

    item.style.display = "flex";
    item.style.alignItems = "center";
    item.style.gap = "8px";

    selectedProductsListEl.appendChild(item);
  });
}

// Click on product card should add product to selected list. Removal only via X button.
productsContainer.addEventListener("click", (e) => {
  // If user clicked the description toggle button, handle expand/collapse
  const descBtn = e.target.closest(".desc-toggle");
  if (descBtn) {
    const id = descBtn.getAttribute("data-id");
    const descEl = document.getElementById(`desc-${id}`);
    if (!descEl) return;
    const expanded = descBtn.getAttribute("aria-expanded") === "true";
    descBtn.setAttribute("aria-expanded", String(!expanded));
    descEl.setAttribute("aria-hidden", String(expanded));
    descEl.classList.toggle("open", !expanded);
    return; // do not treat this click as a selection
  }

  const card = e.target.closest(".product-card");
  if (!card) return;
  const id = parseInt(card.getAttribute("data-id"), 10);
  if (!id) return;

  if (selectedProductIds.includes(id)) {
    // already selected — do nothing (only remove via X)
    return;
  }

  // Add id and persist
  selectedProductIds.push(id);
  saveSelectedIds();

  // Mark card visually
  card.classList.add("selected");

  // If we have the product details, re-render the selected list
  renderSelectedProducts();
});

// Delegate remove clicks from selected products area
selectedProductsListEl.addEventListener("click", (e) => {
  const btn = e.target.closest(".remove-selected");
  if (!btn) return;
  const id = parseInt(btn.getAttribute("data-id"), 10);
  if (!id) return;

  // Remove id
  selectedProductIds = selectedProductIds.filter((sid) => sid !== id);
  saveSelectedIds();

  // Update any displayed cards
  const cardEl = productsContainer.querySelector(
    `.product-card[data-id='${id}']`
  );
  if (cardEl) cardEl.classList.remove("selected");

  renderSelectedProducts();
});

// Initialize cache and selected UI on load
loadProducts().then((products) => {
  allProducts = products;
  // Reconcile selected ids with loaded products (remove any stale ids)
  selectedProductIds = selectedProductIds.filter((id) =>
    allProducts.some((p) => p.id === id)
  );
  saveSelectedIds();
  renderSelectedProducts();
});

/* ----------------------- Chat + OpenAI proxy ----------------------- */
// Keep a simple message history so follow-ups work. Instruct the assistant to
// use 'Step 1:', 'Step 2:', etc., and to avoid asterisks/markdown for readability.
const messages = [
  {
    role: "system",
    content:
      "You are a helpful L'Oréal product and routine advisor. When presenting routines or step-by-step instructions, always label steps as 'Step 1:', 'Step 2:', etc. Do NOT use asterisks (*), Markdown emphasis, or other markup—return plain, easy-to-read text. Keep explanations concise and include cautions where relevant. Make sure steps are bold for clarity.",
  },
];

function formatTime(ts = Date.now()) {
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

// Append a chat message and return the message element so callers can update status
function appendMessage(role, text) {
  const id = `msg-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

  const wrapper = document.createElement("div");
  wrapper.className = `msg ${role === "user" ? "user-msg" : "assistant-msg"}`;
  wrapper.setAttribute("data-id", id);
  wrapper.style.marginBottom = "12px";

  // Avatar
  const avatar = document.createElement("div");
  avatar.className = "avatar";
  avatar.textContent = role === "user" ? "You" : "AI";

  // Bubble
  const bubble = document.createElement("div");
  bubble.className = "bubble";
  bubble.textContent = text;

  // Meta (time + status)
  const meta = document.createElement("div");
  meta.className = "meta";
  const ts = document.createElement("span");
  ts.className = "timestamp";
  ts.textContent = formatTime();
  const status = document.createElement("span");
  status.className = "delivery-status";
  status.textContent = role === "user" ? "Sending..." : "";

  meta.appendChild(ts);
  meta.appendChild(status);

  const container = document.createElement("div");
  container.className = "bubble-and-meta";
  container.appendChild(bubble);
  container.appendChild(meta);

  const row = document.createElement("div");
  row.className = "msg-row";
  row.appendChild(avatar);
  row.appendChild(container);

  wrapper.appendChild(row);
  chatWindow.appendChild(wrapper);
  chatWindow.scrollTop = chatWindow.scrollHeight;

  return wrapper;
}

function updateMessageStatus(msgEl, statusText) {
  if (!msgEl) return;
  const status = msgEl.querySelector(".delivery-status");
  if (status) status.textContent = statusText;
}

async function callWorkerProxy(messagesToSend) {
  // POST messages to the worker; the worker should forward to OpenAI using the stored key
  try {
    const res = await fetch(workerEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ messages: messagesToSend, model: "gpt-4o" }),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Worker error: ${res.status} ${errText}`);
    }

    const data = await res.json();

    // Expecting standard OpenAI shape: data.choices[0].message.content
    if (data.choices && data.choices[0] && data.choices[0].message) {
      return data.choices[0].message.content;
    }

    // Fallback if the worker returns a different shape
    if (data.output) return data.output;

    throw new Error("Unexpected response shape from worker.");
  } catch (err) {
    console.error(err);
    throw err;
  }
}

/* Chat form submission: send user message to the worker and render assistant reply */
chatForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const input = document.getElementById("userInput");
  const text = input.value.trim();
  if (!text) return;

  // Show user message locally
  const userMsgEl = appendMessage("user", text);
  messages.push({ role: "user", content: text });
  input.value = "";

  // Show a loading placeholder
  const loadingEl = document.createElement("div");
  loadingEl.className = "msg assistant-msg";
  loadingEl.textContent = "Generating response... Please wait!";
  chatWindow.appendChild(loadingEl);
  chatWindow.scrollTop = chatWindow.scrollHeight;

  try {
    const reply = await callWorkerProxy(messages);
    // remove loading
    loadingEl.remove();

    // mark user message as delivered/read
    updateMessageStatus(userMsgEl, "Delivered");

    const assistantEl = appendMessage("assistant", reply);
    messages.push({ role: "assistant", content: reply });

    // mark user's message as read when assistant replies
    updateMessageStatus(userMsgEl, "Read");
    // assistant messages are considered delivered
    updateMessageStatus(assistantEl, "Delivered");
  } catch (err) {
    loadingEl.textContent =
      "Sorry — I couldn't reach the assistant. Try again later.";
    updateMessageStatus(userMsgEl, "Failed");
  }
});

/* Wire generate routine button briefly to show it's connected to the worker
   (full routine generation flow can be added in Step 2). */
if (generateRoutineBtn) {
  generateRoutineBtn.addEventListener("click", async () => {
    // Disable button while working
    generateRoutineBtn.disabled = true;
    generateRoutineBtn.textContent = "Generating...";

    // Build payload for assistant based on selected products
    const selectedProducts = (allProducts || []).filter((p) =>
      selectedProductIds.includes(p.id)
    );

    let userPrompt = "";
    if (!selectedProducts || selectedProducts.length === 0) {
      // No selected products: ask the assistant to prompt the user for details
      userPrompt = `I would like a personalized routine, but I haven't selected any products yet. Please ask me follow-up questions to learn my skin/hair type, concerns, allergies, and whether I want an AM or PM routine, so you can recommend products and a step-by-step routine. IMPORTANT: When you ask questions or provide an eventual routine, label steps as 'Step 1:', 'Step 2:', etc., and do not use any asterisks (*) or Markdown formatting—use plain text only.`;
      appendMessage("user", userPrompt);
      messages.push({ role: "user", content: userPrompt });
    } else {
      // Create a concise summary of selected products and ask for a routine
      const productSummaries = selectedProducts
        .map(
          (p, i) =>
            `${i + 1}. ${p.brand} — ${p.name} (${p.category})\n   ${
              p.description ? p.description : ""
            }`
        )
        .join("\n\n");

      userPrompt = `Please create a clear, step-by-step personalized routine using only the selected products below. For each step, include the product name, when to use it (AM/PM), order, short rationale, clear step by step answers, and any cautions (e.g., avoid retinol with certain actives). Keep it friendly and concise. IMPORTANT: Label each step exactly as 'Step 1:', 'Step 2:', etc. Do NOT use asterisks (*) or Markdown formatting—return plain text only.\n\nSelected products:\n${productSummaries}`;

      appendMessage(
        "user",
        "Please generate a personalized routine using the selected products."
      );
      // Push a structured message that includes the product list
      messages.push({ role: "user", content: userPrompt });
    }

    // Show a loading placeholder in the chat
    const loadingEl = document.createElement("div");
    loadingEl.className = "msg assistant-msg";
    loadingEl.textContent = "Generating routine...";
    chatWindow.appendChild(loadingEl);
    chatWindow.scrollTop = chatWindow.scrollHeight;

    try {
      const reply = await callWorkerProxy(messages);
      loadingEl.remove();
      appendMessage("assistant", reply);
      messages.push({ role: "assistant", content: reply });
    } catch (err) {
      loadingEl.textContent = "Could not generate routine right now.";
    }

    // Restore button state
    generateRoutineBtn.disabled = false;
    generateRoutineBtn.innerHTML =
      '<i class="fa-solid fa-wand-magic-sparkles"></i> Generate Routine';
  });
}
