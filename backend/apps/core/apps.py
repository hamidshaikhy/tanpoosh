from django.apps import AppConfig


class CoreConfig(AppConfig):
    name = "apps.core"
    label = "core"
    verbose_name = "هسته"

    def ready(self):
        from . import schema  # noqa: F401 -- register the authentication extension
