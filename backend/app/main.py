from decimal import Decimal

from fastapi import Depends, FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, joinedload

from .database import Base, engine, get_db
from .models import Customer, Order, OrderItem, Product
from .schemas import (
    CustomerCreate,
    CustomerOut,
    DashboardSummary,
    OrderCreate,
    OrderOut,
    ProductCreate,
    ProductOut,
    ProductUpdate,
)

Base.metadata.create_all(bind=engine)

app = FastAPI(title="Inventory & Order Management API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
def root():
    return {"message": "Inventory & Order Management API is running"}


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/dashboard", response_model=DashboardSummary)
def dashboard(db: Session = Depends(get_db)):
    return DashboardSummary(
        total_products=db.query(Product).count(),
        total_customers=db.query(Customer).count(),
        total_orders=db.query(Order).count(),
        low_stock_products=db.query(Product).filter(Product.quantity <= 5).count(),
    )


@app.post("/products", response_model=ProductOut, status_code=status.HTTP_201_CREATED)
def create_product(payload: ProductCreate, db: Session = Depends(get_db)):
    product = Product(**payload.model_dump())
    db.add(product)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail="Product SKU must be unique") from exc
    db.refresh(product)
    return product


@app.get("/products", response_model=list[ProductOut])
def list_products(db: Session = Depends(get_db)):
    return db.query(Product).order_by(Product.id.desc()).all()


@app.get("/products/{product_id}", response_model=ProductOut)
def get_product(product_id: int, db: Session = Depends(get_db)):
    product = db.get(Product, product_id)
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    return product


@app.put("/products/{product_id}", response_model=ProductOut)
def update_product(product_id: int, payload: ProductUpdate, db: Session = Depends(get_db)):
    product = db.get(Product, product_id)
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(product, key, value)

    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail="Product SKU must be unique") from exc
    db.refresh(product)
    return product


@app.delete("/products/{product_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_product(product_id: int, db: Session = Depends(get_db)):
    product = db.get(Product, product_id)
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    order_count = db.query(OrderItem).filter(OrderItem.product_id == product_id).count()
    if order_count:
        raise HTTPException(
            status_code=400,
            detail="This product is used in existing orders. Cancel those orders before deleting it.",
        )
    db.delete(product)
    db.commit()
    return None


@app.post("/customers", response_model=CustomerOut, status_code=status.HTTP_201_CREATED)
def create_customer(payload: CustomerCreate, db: Session = Depends(get_db)):
    customer = Customer(**payload.model_dump())
    db.add(customer)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail="Customer email must be unique") from exc
    db.refresh(customer)
    return customer


@app.get("/customers", response_model=list[CustomerOut])
def list_customers(db: Session = Depends(get_db)):
    return db.query(Customer).order_by(Customer.id.desc()).all()


@app.get("/customers/{customer_id}", response_model=CustomerOut)
def get_customer(customer_id: int, db: Session = Depends(get_db)):
    customer = db.get(Customer, customer_id)
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")
    return customer


@app.delete("/customers/{customer_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_customer(customer_id: int, db: Session = Depends(get_db)):
    customer = db.get(Customer, customer_id)
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")
    order_count = db.query(Order).filter(Order.customer_id == customer_id).count()
    if order_count:
        raise HTTPException(
            status_code=400,
            detail="This customer has existing orders. Cancel those orders before deleting the customer.",
        )
    db.delete(customer)
    db.commit()
    return None


@app.post("/orders", response_model=OrderOut, status_code=status.HTTP_201_CREATED)
def create_order(payload: OrderCreate, db: Session = Depends(get_db)):
    customer = db.get(Customer, payload.customer_id)
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")

    requested_quantities: dict[int, int] = {}
    for item in payload.items:
        requested_quantities[item.product_id] = requested_quantities.get(item.product_id, 0) + item.quantity

    products = db.query(Product).filter(Product.id.in_(requested_quantities.keys())).all()
    products_by_id = {product.id: product for product in products}

    missing_ids = set(requested_quantities) - set(products_by_id)
    if missing_ids:
        raise HTTPException(status_code=404, detail=f"Product(s) not found: {sorted(missing_ids)}")

    for product_id, requested_quantity in requested_quantities.items():
        product = products_by_id[product_id]
        if product.quantity < requested_quantity:
            raise HTTPException(
                status_code=400,
                detail=f"Insufficient stock for {product.name}. Available: {product.quantity}",
            )

    total = Decimal("0.00")
    order_items: list[OrderItem] = []
    for product_id, requested_quantity in requested_quantities.items():
        product = products_by_id[product_id]
        line_total = product.price * requested_quantity
        total += line_total
        product.quantity -= requested_quantity
        order_items.append(
            OrderItem(
                product_id=product.id,
                quantity=requested_quantity,
                unit_price=product.price,
                line_total=line_total,
            )
        )

    order = Order(customer_id=customer.id, total_amount=total, items=order_items)
    db.add(order)
    db.commit()
    return _load_order(db, order.id)


@app.get("/orders", response_model=list[OrderOut])
def list_orders(db: Session = Depends(get_db)):
    return (
        db.query(Order)
        .options(joinedload(Order.customer), joinedload(Order.items).joinedload(OrderItem.product))
        .order_by(Order.id.desc())
        .all()
    )


@app.get("/orders/{order_id}", response_model=OrderOut)
def get_order(order_id: int, db: Session = Depends(get_db)):
    return _load_order(db, order_id)


@app.delete("/orders/{order_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_order(order_id: int, db: Session = Depends(get_db)):
    order = _load_order(db, order_id)
    for item in order.items:
        item.product.quantity += item.quantity
    db.delete(order)
    db.commit()
    return None


def _load_order(db: Session, order_id: int) -> Order:
    order = (
        db.query(Order)
        .options(joinedload(Order.customer), joinedload(Order.items).joinedload(OrderItem.product))
        .filter(Order.id == order_id)
        .first()
    )
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    return order
