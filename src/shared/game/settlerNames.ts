export type SettlerGender = 'male' | 'female';

export const MALE_FIRST_NAMES = [
    'James', 'Liam', 'Noah', 'Mason', 'Lucas', 'Ethan', 'Logan', 'Jacob', 'Aiden', 'Owen',
    'Jack', 'Henry', 'Levi', 'Wyatt', 'Samuel', 'Caleb', 'Ryan', 'Nathan', 'Luke', 'Daniel',
    'Julian', 'David', 'Isaac', 'Lincoln', 'Hudson', 'Mateo', 'Carter', 'Ezra', 'Eli', 'Adam',
    'Thomas', 'Connor', 'Jason', 'Aaron', 'Andrew', 'Cole', 'Xavier', 'Dominic', 'Miles', 'Elias',
    'Evan', 'Nolan', 'Carson', 'Micah', 'Adrian', 'Landon', 'Blake', 'Gavin', 'Weston', 'Sawyer',
    'Jordan', 'Bennett', 'Parker', 'Tucker', 'Declan', 'Silas', 'Rowan', 'Asher', 'Brooks', 'Jesse',
    'Max', 'Theo', 'Jonah', 'Damian', 'Brady', 'Rhett', 'Tyler', 'Austin', 'Colin', 'Spencer',
    'Grant', 'Harrison', 'Wesley', 'Dean', 'Milo', 'Finn', 'Kai', 'Joel', 'Graham', 'Marcus',
    'Tobias', 'Simon', 'Lars', 'Koen', 'Bram', 'Sven', 'Niels', 'Jasper', 'Willem', 'Daan',
    'Pieter', 'Remy', 'Otis', 'Bennie', 'Dirk', 'Calvin', 'Quinn', 'Rhys', 'Beau', 'Drew',
] as const;

export const FEMALE_FIRST_NAMES = [
    'Emma', 'Olivia', 'Charlotte', 'Amelia', 'Ava', 'Sophia', 'Mia', 'Isabella', 'Harper', 'Evelyn',
    'Abigail', 'Ella', 'Grace', 'Scarlett', 'Lily', 'Chloe', 'Aria', 'Nora', 'Zoey', 'Hannah',
    'Lillian', 'Addison', 'Aubrey', 'Ellie', 'Stella', 'Natalie', 'Leah', 'Hazel', 'Violet', 'Aurora',
    'Savannah', 'Lucy', 'Claire', 'Audrey', 'Brooklyn', 'Anna', 'Caroline', 'Sarah', 'Maya', 'Naomi',
    'Elena', 'Alice', 'Sadie', 'Autumn', 'Ruby', 'Eva', 'Quinn', 'Madeline', 'Josephine', 'Piper',
    'Bella', 'Cora', 'Willow', 'Julia', 'Sophie', 'Allison', 'Kennedy', 'Valerie', 'Ivy', 'Delilah',
    'Jade', 'Rose', 'Taylor', 'Hadley', 'Katherine', 'Vivian', 'Elise', 'Mila', 'Luna', 'Iris',
    'Lena', 'Lauren', 'Jasmine', 'Paige', 'Morgan', 'Sydney', 'Brooke', 'Summer', 'Sloane', 'Maren',
    'Anouk', 'Noor', 'Tess', 'Lotte', 'Fenna', 'Esmee', 'Sanne', 'Mila', 'Vera', 'Maud',
    'Poppy', 'June', 'Ayla', 'Riley', 'Ember', 'Remi', 'Willa', 'Daphne', 'Nina', 'Elodie',
] as const;

export const FAMILY_NAMES = [
    'Smith', 'Johnson', 'Miller', 'Davis', 'Wilson', 'Moore', 'Taylor', 'Anderson', 'Thomas', 'Jackson',
    'White', 'Harris', 'Martin', 'Thompson', 'Garcia', 'Martinez', 'Clark', 'Lewis', 'Walker', 'Hall',
    'Young', 'Allen', 'King', 'Wright', 'Scott', 'Green', 'Baker', 'Adams', 'Nelson', 'Carter',
    'Mitchell', 'Roberts', 'Turner', 'Phillips', 'Campbell', 'Parker', 'Evans', 'Edwards', 'Collins', 'Stewart',
    'Van Buren', 'Vandermeer', 'Van Doren', 'Van Alst', 'Decker', 'DeWitt', 'Brouwer', 'Jansen', 'Van Pelt', 'Van Houten',
] as const;

function hashString(value: string) {
    let hash = 2166136261;
    for (let i = 0; i < value.length; i++) {
        hash ^= value.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
    }

    return hash >>> 0;
}

export function getSettlerIdentity(id: string) {
    const gender: SettlerGender = (hashString(`${id}:gender`) % 2) === 0 ? 'male' : 'female';
    const firstNames = gender === 'male' ? MALE_FIRST_NAMES : FEMALE_FIRST_NAMES;
    const firstName = firstNames[hashString(`${id}:first`) % firstNames.length]!;
    const familyName = FAMILY_NAMES[hashString(`${id}:family`) % FAMILY_NAMES.length]!;

    return {
        gender,
        firstName,
        familyName,
        fullName: `${firstName} ${familyName}`,
    };
}

export function getSettlerDisplayName(id: string) {
    return getSettlerIdentity(id).fullName;
}
