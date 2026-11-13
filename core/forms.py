"""Edit forms, one per topic, built from the topic model's input (non-generated) fields."""
import datetime as dt
from functools import cache

from django import forms
from django.conf import settings

from . import utils
from .topics import get_topic, identity_model


class TopicForm(forms.ModelForm):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        for f in self.fields.values():
            f.widget.attrs.setdefault("class", "form-control form-control-sm")
            f.widget.attrs.setdefault("autocomplete", "off")

    def clean(self):
        """Typed fields: numbers are normalised ("1,234" -> "1234"), dates must be YYYY-MM-DD."""
        data = super().clean()
        model = self._meta.model
        for name in getattr(model, "NUMBER_FIELDS", ()):
            v = (data.get(name) or "").strip() if name in self.fields else ""
            if v:
                n = utils.number(v)
                if n is None:
                    self.add_error(name, "Enter a number.")
                else:
                    data[name] = n
        for name in getattr(model, "DATE_FIELDS", ()):
            v = (data.get(name) or "").strip() if name in self.fields else ""
            if v:
                try:
                    dt.date.fromisoformat(v)
                except ValueError:
                    self.add_error(name, "Enter a date (YYYY-MM-DD).")
        return data

    def is_valid(self):
        ok = super().is_valid()
        for name in self.errors:
            if name in self.fields:
                w = self.fields[name].widget
                w.attrs["class"] = w.attrs.get("class", "") + " is-invalid"
        return ok

    # Only runs on the Demand and destination form. The month grid (JS) fills this hidden input.
    def clean_monthly_profile(self):
        text, _ = utils.normalize_profile(self.cleaned_data.get("monthly_profile"))
        return text  # unreadable legacy text is kept until months are entered in the grid

    # Only runs on the Record Identity form (the only one with this field).
    def clean_demand_line_id(self):
        value = (self.cleaned_data.get("demand_line_id") or "").strip()
        if not value:
            raise forms.ValidationError("Demand-line ID is required: uploads match rows on it.")
        clash = identity_model().objects.filter(demand_line_id=value).exclude(pk=self.instance.pk).first()
        if clash:
            raise forms.ValidationError(f"Already used by {clash.eds_record_id}.")
        return value


@cache
def form_class(app_label):
    topic = get_topic(app_label)
    names = [n for n, _ in topic.input_fields]
    widgets = {
        n: forms.Textarea(attrs={"rows": 3}) if n in topic.expandable_fields else forms.TextInput()
        for n in names
    }
    for n in topic.date_fields & set(names):
        widgets[n] = forms.DateInput(attrs={"type": "date"}, format="%Y-%m-%d")
    for n in topic.number_fields & set(names):
        widgets[n] = forms.NumberInput(attrs={"step": "any", "inputmode": "decimal"})
    if topic.monthly_field:
        widgets[topic.monthly_field] = forms.HiddenInput(attrs={
            "data-month-profile": "1", "data-month-count": settings.EDS_MONTHLY_WINDOW_MONTHS})
    return forms.modelform_factory(topic.model, form=TopicForm, fields=names, widgets=widgets)
