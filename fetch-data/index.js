import fetch from 'node-fetch';
import JSDOM from 'jsdom';
import { writeFileSync } from 'fs';

const fetchDocument = (link) => fetch(link).then(res => res.text()).then(body => new JSDOM.JSDOM(body).window.document);

const sections = {
    'informatique': 'IN'
}

for (const section of Object.keys(sections)) {

    fetchDocument(`https://edu.epfl.ch/studyplan/fr/propedeutique/${section}/`)
    .then(async (document) => {

        const coursDataList = [];
        const coursList = document.querySelectorAll('.line');

        for (const cours of coursList) {
            
            // on récup les infos de base

            const isBA1 = cours.children[2].children[0].children[0].textContent !== '-';
            const coursName = cours.children[0].children[0].textContent;
            const coursLink = cours.children[0].children[0].children[0].href;
            const prof = cours.children[0].children[2].textContent;
            if (!isBA1) continue;

            const coursData = {
                coursStandardName: coursName.split(' (')[0],
                coursName,
                coursLink,
                prof,
                lessons: []
            }

            // on fetch l'EDT
            const edtPageDocument = await fetchDocument('https://edu.epfl.ch' + coursLink);
            // ça c'est les lignes pour chaque heure
            const semaineDeRef = edtPageDocument.querySelector('.semaineDeRef').children[0].children;

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

                    const lessonsHourBefore = coursData.lessons.filter(l => l.startHour === startHour - 1);
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

        const formattedCoursDataList = [];

        // regroup les cours qui ont le même nom coursStandardName

        for (const coursData of coursDataList) {
            const coursStandardName = coursData.coursStandardName;
            const existingCours = formattedCoursDataList.find(c => c.coursStandardName === coursStandardName);
            if (existingCours) {
                existingCours.coursList.push(coursData);
            } else {
                formattedCoursDataList.push({
                    coursStandardName,
                    coursList: [coursData]
                });
            }
        }

        writeFileSync(`../data/${sections[section]}.json`, JSON.stringify(formattedCoursDataList, null, 4));
        
    })
}
