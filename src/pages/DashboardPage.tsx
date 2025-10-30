import { Card, Container, Stack, Text, Title } from '@mantine/core'

export const DashboardPage = () => (
  <Container size="xl">
    <Stack gap="lg">
      <Title order={2}>Dashboard</Title>
      <Card shadow="sm" padding="lg" withBorder>
        <Text c="dimmed">Overview widgets coming soon.</Text>
      </Card>
    </Stack>
  </Container>
)
