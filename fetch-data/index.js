import fetch from 'node-fetch';
import JSDOM from 'jsdom';
import { writeFileSync } from 'fs';

const fetchDocument = (link) => fetch(link).then(res => res.text()).then(body => new JSDOM.JSDOM(body).window.document);

const sections = {
    'informatique': 'IN',
    'architecture': 'AR',
    'chimie-et-genie-chimique': 'CGC',
    'genie-civil': 'GC',
    'genie-mecanique': 'GM',
    'genie-electrique-et-electronique': 'EL',
    'ingenierie-des-sciences-du-vivant': 'SV',
    'mathematiques': 'MA',
    'microtechnique': 'MT',
    'physique': 'PH',
    'science-et-genie-des-materiaux': 'MX',
    'sciences-et-ingenierie-de-l-environnement': 'SIE',
    'systemes-de-communication': 'SC'
}

for (const section of Object.keys(sections)) {

    fetchDocument(`https://edu.epfl.ch/studyplan/fr/propedeutique/${section}/`)
    .then(async (document) => {

        const coursDataList = [];
        const coursList = document.querySelectorAll('.line');

        for (const cours of coursList) {
            
            // on récup les infos de base

            const isBA1 = cours.children[2].children[0].children[0].textContent !== '-';
            const subjectCompleteName = cours.children[0].children[0]?.children[0]?.textContent;
            if (!subjectCompleteName) continue;
            const coursLink = cours.children[0].children[0].children[0].href;
            const prof = cours.children[0].children[2].textContent;
            if (!isBA1) continue;

            const coursPrecision = subjectCompleteName.split('(')[1]?.split(')')[0];
            const coursName = subjectCompleteName.split(' (')[0] + (coursPrecision ? ` (${coursPrecision})` : '');
            const coursDisplayName = prof + (coursPrecision ? ` (${coursPrecision})` : '');

            const subjectStandardName = coursName.split(' (')[0];

            const coursData = {
                subjectStandardName,
                coursName,
                coursDisplayName,
                coursPrecision,
                coursLink,
                prof,
                lessons: [],
                hourCountCours: 0,
                hourCountExercices: 0
            };

            // on fetch l'EDT
            const edtPageDocument = await fetchDocument('https://edu.epfl.ch' + coursLink);
            // ça c'est les lignes pour chaque heure
            const semaineDeRef = edtPageDocument.querySelector('.semaineDeRef').children[0].children;

            let hourCountCours = 0;
            let hourCountExercices = 0;

            const rowsProperty = edtPageDocument.querySelector('.list-bullet');
            for (const rowProperty of rowsProperty.children) {
                const row = rowProperty.textContent;
                if (row.startsWith('Cours')) {
                    hourCountCours = parseInt(row.split(' ')[1]?.split(' ')[0])
                } else if (row.startsWith('Exercices')) {
                    hourCountExercices = parseInt(row.split(' ')[1]?.split(' ')[0])
                }
            }

            coursData.hourCountCours = hourCountCours;
            coursData.hourCountExercices = hourCountExercices;

            for (const hours of semaineDeRef) {

                // td.time (8-9, 9-10, ou vide pour l'en-tête)
                const startHour = parseInt(hours.children[0].textContent.split('-')[0]);

                if (isNaN(startHour)) continue;

                // 5 jours de la semaine
                let idx = -2;
                for (const child of hours.children) {
                    idx++;
                    if (child.textContent === ' ') continue;
                    const isCourse = child.classList.contains('taken');
                    if (!isCourse) continue;
                    const hoursCount = parseInt(child.getAttribute('rowspan')) || 1;
                    const isExercice = child.classList.contains('exercice');
                    
                    // en fait ici on doit vérifier si l'heure d'avant il y a un cours ou pas, parce que ça décale les jours
                    // par ex. s'il y a un cours l'heure d'avant le mardi on aura juste un td pour le lundi, le mercredi et le jeudi

                    const lessonsHourBefore = coursData.lessons.filter(l => l.startHour === startHour - 1 && l.hoursCount > 1);
                    const daysPresentDansLeTr = [1,2,3,4,5];
                    for (const lessonHourBefore of lessonsHourBefore) {
                        const idx = daysPresentDansLeTr.indexOf(lessonHourBefore.day);
                        if (idx !== -1) daysPresentDansLeTr.splice(idx, 1);
                    }
                    
                    coursData.lessons.push({
                        day: daysPresentDansLeTr[idx],
                        startHour,
                        hoursCount,
                        isExercice
                    });
                }

            }

            coursDataList.push(coursData);

        }

        const newCoursDataList = [];
        const formattedSubjectDataList = [];

        // là on va gérer les cours à dupliquer

        for (const cours of coursDataList) {

            console.log(cours.coursName)


            const configLecons = [];
            const configExercices = [];

            const hourCountCours = cours.hourCountCours;
            const hourCountExercices = cours.hourCountExercices;

            const lessonsExercices = cours.lessons.filter(l => l.isExercice);
            const lessonsCours = cours.lessons.filter(l => !l.isExercice);

            for (const lesson of lessonsExercices) {
                let sum = lesson.hoursCount;
                let currentLessons = [lesson];
                console.log(sum, hourCountExercices, sum === hourCountExercices)
                if (sum === hourCountExercices) {
                    configExercices.push(currentLessons);
                    currentLessons = [lesson];
                }
                for (const lesson2 of lessonsExercices) {
                    if (lesson2 === lesson) continue;
                    currentLessons.push(lesson2);
                    sum += lesson2.hoursCount;
                    if (sum === hourCountExercices) {
                        configExercices.push(currentLessons);
                        sum = lesson.hoursCount;
                        currentLessons = [lesson];
                    }
                }
            }

            if (cours.coursName === 'Construction mécanique I (pour MT)') console.log(configExercices);

            for (const lesson of lessonsCours) {
                let sum = lesson.hoursCount;
                let currentLessons = [lesson];
                if (sum === hourCountCours) {
                    configLecons.push(currentLessons);
                    currentLessons = [lesson];
                }
                for (const lesson2 of lessonsCours) {
                    if (lesson2 === lesson) continue;
                    currentLessons.push(lesson2);
                    sum += lesson2.hoursCount;
                    if (sum === hourCountCours) {
                        configLecons.push(currentLessons);
                        sum = lesson.hoursCount;
                        currentLessons = [lesson];
                    }
                }
            }

            // remove duplicate lessons (diff order but same lessons)
            const uniqueConfigLecons = [];
            for (const configLecon of configLecons) {
                // is there a similar config lecon already in the lecon list?
                let isUnique = true;
                for (const uniqueConfigLecon of uniqueConfigLecons) {
                    if (configLecon.every(cl => uniqueConfigLecon.some(cl2 => cl2 === cl))) {
                        isUnique = false;
                        break;
                    }
                }
                if (isUnique) uniqueConfigLecons.push(configLecon);
            }

            const uniqueConfigExercices = [];
            for (const configExercice of configExercices) {
                // is there a similar config lecon already in the lecon list?
                let isUnique = true;
                for (const uniqueConfigExercice of uniqueConfigExercices) {
                    if (configExercice.every(cl => uniqueConfigExercice.some(cl2 => cl2 === cl))) {
                        isUnique = false;
                        break;
                    }
                }
                if (isUnique) uniqueConfigExercices.push(configExercice);
            }

            if (cours.coursName === 'Construction mécanique I (pour MT)') console.log(uniqueConfigExercices);

            const configTotal = [];

            for (const configExercice of uniqueConfigExercices) {
                for (const configLecon of uniqueConfigLecons) {
                    configTotal.push([...configExercice, ...configLecon]);
                }
            }

            newCoursDataList.push(...configTotal.map(config => ({
                ...cours,
                coursDisplayName: cours.coursDisplayName + (configTotal.length > 1 ? ` (config ${configTotal.indexOf(config) + 1})` : ''),
                lessons: config
            })));

        }

        for (const coursData of newCoursDataList) {
            const subjectStandardName = coursData.subjectStandardName;
            const existingSubject = formattedSubjectDataList.find(c => c.subjectStandardName === subjectStandardName);
            if (existingSubject) {
                existingSubject.coursList.push(coursData);
            } else {
                formattedSubjectDataList.push({
                    subjectStandardName,
                    coursList: [coursData]
                });
            }
        }

        writeFileSync(`../data/${sections[section]}.json`, JSON.stringify(formattedSubjectDataList, null, 4));

        console.log(`Fetched ${section}.`);
        
    });

    writeFileSync('../data/sections.json', JSON.stringify(sections, null, 4));
}
