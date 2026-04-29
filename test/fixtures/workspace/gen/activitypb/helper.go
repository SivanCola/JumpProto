package activitypb

func NewProfile() *UserProfile {
	return &UserProfile{
		UserName: "same-package",
	}
}
