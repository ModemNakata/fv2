# needed to apply migration and view db with dbeaver
# it is base postgres on port 5433 forwarded to default port 5432
ssh -L 5432:127.0.0.1:5433 x10

