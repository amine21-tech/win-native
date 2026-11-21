import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Pressable } from 'react-native';
import { CATEGORY_GROUPS } from '../search/categories';
import { radius, spacing, typography, type Palette } from '../theme';

type Props = {
  onPick: (dataQ: string, label: string) => void;
  /**
   * Ouvre le module Emploi (point 11 du client, 27 octobre).
   *
   * Il est passe A PART des autres rubriques, et non ajoute a CATEGORY_GROUPS, parce qu'il ne
   * fait pas la meme chose : les autres lancent une recherche d'adresses, celui-ci ouvre un
   * module entier avec ses offres, ses filtres et son formulaire de publication. Le ranger
   * avec les categories aurait oblige a inventer un faux `dataQ` et a le detourner ensuite.
   */
  onEmploi?: () => void;
  colors: Palette;
};

/**
 * Boutons de categories rapides : un groupe (7, avec emoji) revele ses
 * sous-categories, sauf s'il n'en a qu'une seule — elle est alors cherchee
 * directement, comme runCategorySearch()/le clic sur `.grp` en v83.
 */
export function CategoryChips({ onPick, onEmploi, colors }: Props) {
  const { t } = useTranslation();
  const [openGroup, setOpenGroup] = useState<string | null>(null);

  const toggleGroup = (key: string) => {
    const group = CATEGORY_GROUPS.find((g) => g.key === key)!;
    if (group.items.length === 1) {
      const only = group.items[0]!;
      onPick(only.dataQ, t(`categories.items.${only.labelKey}`));
      return;
    }
    setOpenGroup((current) => (current === key ? null : key));
  };

  const active = CATEGORY_GROUPS.find((g) => g.key === openGroup);

  return (
    <View style={styles.wrap}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {/* L'EMPLOI EN TETE DE RANGEE, et borde d'or plutot que du vert des autres : c'est une
            rubrique payante et nouvelle, elle doit se distinguer de la recherche d'adresses
            sans pour autant sortir de la rangee ou les gens regardent. */}
        {onEmploi ? (
          <Pressable
            onPress={onEmploi}
            accessibilityRole="button"
            style={[styles.grp, { backgroundColor: colors.surface, borderColor: colors.gold }]}
          >
            <Text style={styles.emoji}>💼</Text>
            {/* TEXTE NOIR et non or (correction C5 du 31 octobre). L'or sur fond blanc n'avait
                pas assez de contraste : il se lisait bien sur une capture d'ecran, mal au
                soleil, et c'est la seule condition qui compte dans une voiture. La bordure
                reste doree — elle suffit a distinguer la rubrique sans toucher au texte.

                LE NOIR ETAIT ECRIT EN DUR, et c'est ce qui l'a fait disparaitre en mode nuit :
                du #1A2319 sur un fond sombre ne se voit pas. Le defaut etait previsible et
                personne ne l'a vu — C5 a ete demandee, appliquee et verifiee de jour.

                Il suit donc `colors.text`, comme le libelle de TOUS les autres groupes. C'est
                d'ailleurs ce que C5 demandait vraiment : << comme les autres, et non en or >>.
                De jour cela donne le meme noir a six millièmes près ; de nuit, le blanc cassé
                de la palette sombre. Une couleur ecrite en dur dans une application qui a deux
                themes est une erreur en attente. */}
            <Text style={[typography.caption, styles.grpLabel, { color: colors.text }]}>
              {t('jobs.shortTitle')}
            </Text>
          </Pressable>
        ) : null}

        {CATEGORY_GROUPS.map((group) => {
          const isOn = group.key === openGroup;
          return (
            <Pressable
              key={group.key}
              onPress={() => toggleGroup(group.key)}
              style={[
                styles.grp,
                {
                  backgroundColor: colors.surface,
                  borderColor: isOn ? colors.accent : colors.goldDeep,
                },
              ]}
            >
              <Text style={styles.emoji}>{group.emoji}</Text>
              <Text style={[typography.caption, styles.grpLabel, { color: isOn ? colors.accent : colors.text }]}>
                {t(`categories.groups.${group.labelKey}`)}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {active ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rowSous}>
          {active.items.map((item) => (
            <Pressable
              key={item.dataQ}
              onPress={() => onPick(item.dataQ, t(`categories.items.${item.labelKey}`))}
              style={[styles.cat, { backgroundColor: colors.surface }]}
            >
              <Text style={[typography.caption, styles.grpLabel, { color: colors.text }]}>
                {t(`categories.items.${item.labelKey}`)}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  row: { gap: spacing.sm, paddingRight: spacing.lg },

  /**
   * LA RANGEE DES SOUS-CATEGORIES DEGAGE LA COLONNE DE BOUTONS — point 4 du 21 novembre.
   *
   * << Les puces de sous-categories (Gendarmerie, Pompiers, Protection civile...) s'etendent
   * sous le bouton microphone et deviennent invisibles ou inatteignables. >>
   *
   * POURQUOI CELA ARRIVE ICI ET PAS AILLEURS. La colonne des dix boutons est ancree EN BAS et
   * grandit vers le HAUT. Sur un ecran court, son premier bouton — le micro de l'assistant —
   * monte jusqu'a la hauteur des rubriques. Le code le disait deja, mot pour mot, a propos d'un
   * defaut precedent : << le micro de l'assistant remontait dans la rangee des rubriques,
   * exactement comme le client l'a vu >>. On avait alors resserre la colonne ; la rangee, elle,
   * continuait de passer dessous.
   *
   * SOIXANTE-DOUZE POINTS, ET C'EST LA VALEUR DU DOCUMENT. Elle tombe juste pour nous aussi :
   * la colonne est posee a `spacing.lg` du bord (16) et ses boutons font au plus HIT_SIZE (52),
   * soit 68 points occupes. Soixante-douze les degagent avec quatre points de marge.
   *
   * UN REMBOURRAGE PLUTOT QU'UNE LARGEUR REDUITE : les puces continuent de defiler jusqu'a la
   * derniere — c'est tout l'interet de le poser sur le CONTENU et non sur la vue. Le document
   * demande `clipToPadding=false` pour la meme raison ; sur un ScrollView de React Native, un
   * rembourrage de contenu se comporte deja ainsi.
   *
   * LA RANGEE PRINCIPALE N'Y TOUCHE PAS : elle est plus haute que le sommet de la colonne.
   */
  rowSous: { gap: spacing.sm, paddingRight: 72 },
  grp: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: radius.pill,
    borderWidth: 2,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  cat: {
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  emoji: { fontSize: 15 },
  grpLabel: { fontWeight: '700' as const },
});
