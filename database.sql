CREATE EXTENSION IF NOT EXISTS "uuid-ossp"

CREATE TABLE users (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    password TEXT NOT NULL,
    phone_number BIGINT NOT NULL,
    created_at BIGINT NOT NULL,
    role TEXT NOT NULL
);

CREATE TABLE trips (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    destination_name TEXT NOT NULL,
    from_date INT NOT NULL,
    to_date INT NOT NULL,
    days INT NOT NULL,
    nights INT NOT NULL,
    price INT NOT NUll,
    desitnations TEXT NOT NULL,
    physical_rating INT NOT NULL,
    description TEXT NOT NULL,
    itinerary TEXT NOT NULL,
    inclusions TEXT NOT NULL,
    excluions TEXT NOT NULL,
    rooms TEXT NOT NULL,
    max_adventurers INT NOT NUll,
    status BOOLEAN DEFAULT TRUE NOT NULL,
    batch_name TEXT NOT NULL
);




CREATE TABLE bookings (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id uuid NOT NUll,
    FOREIGN KEY (user_id) REFERENCES users(id),
    trip_id uuid NOT NUll,
    FOREIGN KEY (trip_id) REFERENCES trips(id),
    name TEXT NOT NULL,
    phone_number VARCHAR(15) NOT NULL,
    guardian_number INT NOT NUll,
    email TEXT NOT NULL,
    payment INT NOT NUll,
    travellers INT NOT NUll,
    room_type TEXT NOT NULL,
    invoice_id INT NOT NULL
)

CREATE TABLE leads (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    type TEXT NOT NULL,
    name TEXT NOT NULL,
    location TEXT NOT NULL,
    travellers INT NOT NULL,
    days INT NOT NUll,
    email TEXT NOT NULL,
    phone INT NOT NULL,
    message TEXT NOT NULL,
    budget INT NOT NUll

)





Insert into users (category, destination, from_date, to_date, days, nights) values ('uttrakhand', 'kedarnath', 1720968830, 1721314430, 8, 7);
Insert into users (category, destination, from_date, to_date, days, nights) values ('himachal', 'manali & kasol', 1720968830, 1721314430, 8, 7);




Insert into trips (destination_name, from_date, to_date, days, nights, price, desitnations, physical_rating, description, itinerary, inclusions, excluions, rooms, max_adventurers) values ('Spiti Valley', 1755347701, 1736498952, 8, 7, 7400, 'delhi, kashmir, gulmarg, pahalgam, betab valley, dal lake, delhi', 4, 'Embark on an unforgettable journey with our Kashmir Tour Packages, where you’ll experience the region’s rich culture and breathtaking landscapes. From serene Shikara rides on the tranquil lakes under the moonlit sky, to exploring the traditional markets filled with handcrafted treasures, Kashmir offers a perfect blend of natural beauty and local charm. Enjoy the crisp mountain air in Pahalgam, surrounded by stunning valleys, or have fun in the snow-covered Gulmarg, with incredible views from the Gondola ride. The spiritual side of Kashmir awaits with its intricate mosques and ancient shrines, adding a sense of wonder to your journey.', 
'{
   "1":{
      "title":"Drive from Delhi to Manali (530 Kilometers, 13 Hours)",
      "content":"Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum."
   },
   "2":{
      "title":"Manali Arrival | Local Sightseeing",
      "content":"Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum."
   },
   "3":{
      "title":"Manali to Solang Valley (13 Kilometers, 1 hour) | Solang Valley Excursion",
      "content":"Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum."
   },
   "4":{
      "title":"Manali to Kasol (75 Kilometers, 2 Hours) | Kasol Sightseeing",
      "content":"Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum."
   }
}', '', '', 'triple, double, single', 14);

 Insert into trips (destination_name, from_date, to_date, days, nights, price, desitnations, physical_rating, description, itinerary, inclusions, excluions, rooms, max_adventurers) values ('Spiti Valley', 1755347701, 1739177352, 8, 7, 9400, 'delhi, kashmir, gulmarg, pahalgam, betab valley, dal lake, delhi', 4, 'Embark on an unforgettable journey with our Kashmir Tour Packages, where you’ll experience the region’s rich culture and breathtaking landscapes. From serene Shikara rides on the tranquil lakes under the moonlit sky, to exploring the traditional markets filled with handcrafted treasures, Kashmir offers a perfect blend of natural beauty and local charm. Enjoy the crisp mountain air in Pahalgam, surrounded by stunning valleys, or have fun in the snow-covered Gulmarg, with incredible views from the Gondola ride. The spiritual side of Kashmir awaits with its intricate mosques and ancient shrines, adding a sense of wonder to your journey.', 
'{
    1: {
        title: "Drive from Delhi to Manali (530 Kilometers, 13 Hours)",
        content: "Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum."
    },
        2: {
        title: "Manali Arrival | Local Sightseeing",
        content: "Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum."
    },
        3: {
        title: "Manali to Solang Valley (13 Kilometers, 1 hour) | Solang Valley Excursion",
        content: "Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum."
    },
        3: {
        title: "Manali to Kasol (75 Kilometers, 2 Hours) | Kasol Sightseeing",
        content: "Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum."
    }
 }', '', '', 'triple, double, single', 14);

 Insert into trips (destination_name, from_date, to_date, days, nights, price, desitnations, physical_rating, description, itinerary, inclusions, excluions, rooms, max_adventurers) values ('Spiti Valley', 1741164552, 1741596552, 8, 7, 11400, 'delhi, kashmir, gulmarg, pahalgam, betab valley, dal lake, delhi', 4, 'Embark on an unforgettable journey with our Kashmir Tour Packages, where you’ll experience the region’s rich culture and breathtaking landscapes. From serene Shikara rides on the tranquil lakes under the moonlit sky, to exploring the traditional markets filled with handcrafted treasures, Kashmir offers a perfect blend of natural beauty and local charm. Enjoy the crisp mountain air in Pahalgam, surrounded by stunning valleys, or have fun in the snow-covered Gulmarg, with incredible views from the Gondola ride. The spiritual side of Kashmir awaits with its intricate mosques and ancient shrines, adding a sense of wonder to your journey.', 
'{
    1: {
        title: "Drive from Delhi to Manali (530 Kilometers, 13 Hours)",
        content: "Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum."
    },
        2: {
        title: "Manali Arrival | Local Sightseeing",
        content: "Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum."
    },
        3: {
        title: "Manali to Solang Valley (13 Kilometers, 1 hour) | Solang Valley Excursion",
        content: "Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum."
    },
        3: {
        title: "Manali to Kasol (75 Kilometers, 2 Hours) | Kasol Sightseeing",
        content: "Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum."
    }
 }', '', '', 'triple, double, single', 14);

 Insert into trips (destination_name, from_date, to_date, days, nights, price, desitnations, physical_rating, description, itinerary, inclusions, excluions, rooms, max_adventurers) values ('Spiti Valley', 1743842952, 1744274952, 8, 7, 13400, 'delhi, kashmir, gulmarg, pahalgam, betab valley, dal lake, delhi', 4, 'Embark on an unforgettable journey with our Kashmir Tour Packages, where you’ll experience the region’s rich culture and breathtaking landscapes. From serene Shikara rides on the tranquil lakes under the moonlit sky, to exploring the traditional markets filled with handcrafted treasures, Kashmir offers a perfect blend of natural beauty and local charm. Enjoy the crisp mountain air in Pahalgam, surrounded by stunning valleys, or have fun in the snow-covered Gulmarg, with incredible views from the Gondola ride. The spiritual side of Kashmir awaits with its intricate mosques and ancient shrines, adding a sense of wonder to your journey.', 
'{
    1: {
        title: "Drive from Delhi to Manali (530 Kilometers, 13 Hours)",
        content: "Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum."
    },
        2: {
        title: "Manali Arrival | Local Sightseeing",
        content: "Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum."
    },
        3: {
        title: "Manali to Solang Valley (13 Kilometers, 1 hour) | Solang Valley Excursion",
        content: "Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum."
    },
        3: {
        title: "Manali to Kasol (75 Kilometers, 2 Hours) | Kasol Sightseeing",
        content: "Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum."
    }
 }', '', '', 'triple, double, single', 14);



