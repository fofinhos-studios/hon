import random
import math
import calendar as cal
from rich import print
import pandas as pd
import matplotlib.pyplot as plt
from tqdm import tqdm
from subprocess import check_output


def simulation(n_books=100, n_days=365, daily_pages=70, sim=1):
    books = []
    total_pages = 0

    for i in range(n_books):
        name = f"Book {i+1}"
        pages = random.randrange(100, 850)
        days = pages / daily_pages

        book = {
            "name": name,
            "pages": pages,
            "pages left": (pages),
            "days to read": days
        }

        books.append(book)
        total_pages += pages
    
    average_pages = total_pages / n_books

    current_book_index = 0
    days = []
    opportunities = 0
    opportunities_pages = 0
    books_read = 0

    for day in range(n_days):
        current_day = day + 1

        if (current_book_index == len(books)):
            break
        
        current_book = books[current_book_index]

        if (current_book["pages left"] < daily_pages):
            # pages_read = current_book["pages left"]
            current_book_index += 1
            opportunities += 1
            # opportunities_pages += (daily_pages) - (pages_read)
            books_read += 1
        else:
            pages_read = daily_pages

        # current_book["pages left"] -= pages_read

    return {
        "simulation": sim,
        "daily_pages": daily_pages,
        "opportunities": opportunities,
        "extra_average_could_have_read": opportunities_pages / opportunities, 
        "extra_total_could_have_read": opportunities_pages, 
        "average_pages_all_books": average_pages, 
        "extra_books_could_have_read": opportunities_pages / average_pages,
        "books_read": books_read
    }

# parameters
n_books = 100
n_days = 365
simulations = 1000

dataframes = []
pages_range = range(10, 160, 10)

with open("results.md", "w") as fp:
    for daily_pages in pages_range:
        print(f"Running simulations: {daily_pages} pages/day...")
        results = []

        for i in tqdm(range(simulations)):
            results.append(simulation(n_books=n_books, n_days=n_days, daily_pages=daily_pages, sim=i))

        df = pd.DataFrame(results)
        df.sort_values(by=['simulation'], inplace=True)

        for column in df.columns:
            if (column == "simulation"):
                continue

            df[f"{column}_CMA"] = df[f"{column}"].expanding().mean()

        dataframes.append(df)

pd.concat(dataframes).to_csv('results.csv', index=None)
