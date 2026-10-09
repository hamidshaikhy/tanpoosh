import pytest

from apps.catalog.models import Category, Product
from apps.content.models import StoreSettings
from tests.conftest import make_product


@pytest.mark.django_db
def test_home_fills_rail_deduplicates_featured_and_includes_eyewear(client):
    clothing = Category.objects.create(name="Clothing", slug="clothing")
    products = [make_product(category=clothing)[0] for _ in range(18)]
    sunglasses = Category.objects.create(name="Sunglasses", slug="sunglasses", sort_order=99)
    glasses = make_product(category=sunglasses)[0]
    draft = make_product(category=sunglasses)[0]
    draft.status = Product.Status.DRAFT
    draft.save()
    settings = StoreSettings.load()
    settings.featured_products = [products[3].pk, products[3].pk, draft.pk, products[0].pk]
    settings.save()

    response = client.get("/api/v1/content/home")
    assert response.status_code == 200
    data = response.json()
    ids = [p["id"] for p in data["picks"]["products"]]
    assert len(ids) == len(set(ids)) == 16
    assert ids[:2] == [products[3].pk, products[0].pk]
    assert draft.pk not in ids
    assert [p["id"] for p in data["eyewear"]] == [glasses.pk]
    assert "sunglasses" in [c["slug"] for c in data["categories"]]


@pytest.mark.django_db
def test_home_handles_an_empty_catalog(client):
    data = client.get("/api/v1/content/home").json()
    assert data["picks"]["products"] == []
    assert data["eyewear"] == []
    assert data["categories"] == []
