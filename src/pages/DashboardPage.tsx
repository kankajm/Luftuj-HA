import { Card, Container, Stack, Text, Title } from "@mantine/core";
import { useTranslation } from "react-i18next";

export function DashboardPage() {
  const { t } = useTranslation();

  return (
    <Container size="xl">
      <Stack gap="lg">
        <Title order={2}>{t("dashboard.title")}</Title>
        <Card shadow="sm" padding="lg" withBorder>
          <Text c="dimmed">{t("dashboard.placeholder")}</Text>
        </Card>
      </Stack>
    </Container>
  );
}
