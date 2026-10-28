from app.rag.compress import compact


def test_csv_drops_empty_columns_rows_and_padding():
    raw = 'Date , Merchant ,Note,Amount\n2025-01-01,"  Chai   Stall ",,15\n,,,\n2025-01-02,Bus,,20\n'
    assert compact("a.csv", raw) == "Date|Merchant|Amount\n2025-01-01|Chai Stall|15\n2025-01-02|Bus|20"


def test_json_minified_and_text_collapsed_and_bad_input_survives():
    assert compact("a.json", '{ "a": 1,\n "b": [1, 2] }') == '{"a":1,"b":[1,2]}'
    assert compact("n.txt", "a   b\t\tc\n\n\n\n\nd  ") == "a b c\n\nd"
    assert compact("bad.json", "{oops   x") == "{oops x"
