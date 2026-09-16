import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Pressable } from 'react-native';
import { CATEGORY_GROUPS } from '../search/categories';
import { radius, spacing, typography, type Palette } from '../theme';

type Props = {
  onPick: (dataQ: string, label: string) => void;
  colors: Palette;
};

/**
 * Boutons de categories rapides : un groupe (7, avec emoji) revele ses
 * sous-categories, sauf s'il n'en a qu'une seule — elle est alors cherchee
 * directement, comme runCategorySearch()/le clic sur `.grp` en v83.
 */
export function CategoryChips({ onPick, colors }: Props) {
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
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
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
